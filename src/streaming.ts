import { parseResponse, safeErrorData, type Provider, type HttpRequest, type Transport } from './providers';

/** Collect complete tool calls before handing them to the shared agent for validation. */
export class ReplyStream {
  private buffer = '';
  private event: string[] = [];
  private text = '';
  private ended = false;
  private finishReason = '';
  private calls = new Map<number, any>();
  private blocks: any[] = [];
  private raw: any = { role: 'assistant', content: '' };
  private size = 0;
  constructor(private provider: Provider, private onText: (text: string) => void) {}
  push(chunk: string): void {
    this.size += chunk.length;
    if (this.size > 4_000_000) throw new Error('Provider reply is too large. Ask for a smaller response.');
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, ''); this.buffer = this.buffer.slice(index + 1);
      this.line(line);
    }
  }
  private line(line: string): void {
    if (this.provider === 'ollama') { if (line.trim()) this.consume(line); return; }
    if (!line) { if (this.event.length) this.consume(this.event.join('\n')); this.event = []; }
    else if (line.startsWith('data:')) this.event.push(line.slice(5).trimStart());
  }
  private append(text: unknown): void {
    if (typeof text === 'string' && text) { this.text += text; this.onText(this.text); }
  }
  private consume(value: string): void {
    if (this.ended) return;
    if (value === '[DONE]') { this.ended = true; return; }
    let data: any;
    try { data = JSON.parse(value); } catch { throw new Error('The provider returned a malformed stream.'); }
    if (data.error || data.type === 'error') throw new Error('The provider interrupted the response. Retry or check your provider account.');
    if (this.provider === 'ollama') {
      this.append(data.message?.content);
      for (const call of data.message?.tool_calls ?? []) this.calls.set(this.calls.size, call);
      if (data.message?.thinking) this.raw.thinking = (this.raw.thinking || '') + data.message.thinking;
      if (data.done) { this.ended = true; this.finishReason = data.done_reason; }
    } else if (this.provider === 'anthropic') {
      if (data.type === 'content_block_start') {
        if (!Number.isSafeInteger(data.index) || data.index < 0 || data.index > 100) throw new Error('Invalid streamed content index.');
        this.blocks[data.index] = { ...data.content_block };
        if (data.content_block?.type === 'text') this.append(data.content_block.text);
      }
      if (data.type === 'content_block_delta') {
        const block = this.blocks[data.index], delta = data.delta;
        if (!block) throw new Error('The provider returned an invalid content block.');
        if (delta.type === 'text_delta') { block.text = (block.text || '') + delta.text; this.append(delta.text); }
        if (delta.type === 'input_json_delta') block.partial = (block.partial || '') + delta.partial_json;
        if (delta.type === 'thinking_delta') block.thinking = (block.thinking || '') + delta.thinking;
        if (delta.type === 'signature_delta') block.signature = (block.signature || '') + delta.signature;
      }
      if (data.type === 'message_delta') this.finishReason = data.delta?.stop_reason;
      if (data.type === 'message_stop') this.ended = true;
    } else {
      const choice = data.choices?.[0], delta = choice?.delta;
      this.append(delta?.content);
      if (delta?.reasoning_details) this.raw.reasoning_details = [...(this.raw.reasoning_details || []), ...delta.reasoning_details];
      for (const call of delta?.tool_calls ?? []) {
        if (!Number.isSafeInteger(call.index) || call.index < 0 || call.index > 100) throw new Error('Invalid streamed tool index.');
        const prior = this.calls.get(call.index) || { type: 'function', function: { name: '', arguments: '' } };
        if (call.id) prior.id = call.id;
        if (call.function?.name) prior.function.name += call.function.name;
        if (call.function?.arguments) prior.function.arguments += call.function.arguments;
        this.calls.set(call.index, prior);
      }
      if (choice?.finish_reason) this.finishReason = choice.finish_reason;
    }
  }
  finish(): any {
    if (this.buffer) this.line(this.buffer);
    if (this.event.length) this.consume(this.event.join('\n'));
    if (!this.ended) throw new Error('The response ended early. Partial text was kept; incomplete actions were not run.');
    let data: any;
    if (this.provider === 'anthropic') {
      const content = this.blocks.map(block => {
        const { partial, ...rest } = block;
        if (partial !== undefined) {
          try { rest.input = JSON.parse(partial); } catch { throw new Error('The model returned incomplete tool arguments.'); }
        }
        return rest;
      });
      data = { content, stop_reason: this.finishReason };
    } else {
      const message = { ...this.raw, content: this.text, ...(this.calls.size ? { tool_calls: [...this.calls.values()] } : {}) };
      data = this.provider === 'ollama' ? { message, done_reason: this.finishReason } : { choices: [{ message, finish_reason: this.finishReason }] };
    }
    parseResponse(this.provider, data); // No incomplete or invalid calls can escape the collector.
    return data;
  }
}

/** Loaded only on desktop. No redirects, credential forwarding or TLS overrides. */
export function desktopStreamTransport(provider: Provider, onText: (text: string) => void): Transport {
  return (request: HttpRequest, signal?: AbortSignal) => new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const http: typeof import('node:http') = new URL(request.url).protocol === 'https:' ? require('node:https') : require('node:http');
    const collector = new ReplyStream(provider, text => { if (!signal?.aborted) onText(text); });
    let response: import('node:http').IncomingMessage | undefined;
    let settled = false;
    const finish = (error?: Error, value?: { status: number; json: any }) => {
      if (settled) return; settled = true; signal?.removeEventListener('abort', abort);
      if (error) { response?.destroy(); req.destroy(); reject(error); } else resolve(value!);
    };
    const abort = () => finish(new Error('Stopped.'));
    const req = http.request(request.url, { method: request.method, headers: { ...request.headers, 'Accept-Encoding': 'identity' } }, incoming => {
      response = incoming;
      const status = incoming.statusCode || 500, decoder = new TextDecoder(); let errorBody = '';
      if (status >= 300 && status < 400) { finish(new Error('The streaming endpoint redirected. Set the final API URL in MechApe settings.')); return; }
      incoming.on('data', (chunk: Uint8Array) => {
        if (settled || signal?.aborted) return;
        try {
          const text = decoder.decode(chunk, { stream: true });
          if (status >= 400) errorBody = (errorBody + text).slice(0, 65536); else collector.push(text);
        } catch (error) { finish(error instanceof Error ? error : new Error('Invalid provider stream.')); }
      });
      incoming.on('end', () => {
        if (settled) return;
        try {
          if (status >= 400) finish(undefined, { status, json: safeErrorData(errorBody) });
          else { collector.push(decoder.decode()); finish(undefined, { status, json: collector.finish() }); }
        } catch (error) { finish(error instanceof Error ? error : new Error('Invalid provider stream.')); }
      });
      incoming.on('error', () => finish(new Error('The provider connection was interrupted. Partial text was kept.')));
    });
    req.on('error', () => finish(new Error('Cannot reach the provider. Check your connection and model server.')));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else req.end(request.body);
  });
}
