import * as nodeHttp from 'node:http';
import * as nodeHttps from 'node:https';
import { objectValue, stringValue, arrayValue } from './validation';
import { parseResponse, safeErrorData, type Provider, type HttpRequest, type Transport } from './providers';

/** Collect complete tool calls before handing them to the shared agent for validation. */
export class ReplyStream {
  private buffer = '';
  private event: string[] = [];
  private text = '';
  private ended = false;
  private finishReason = '';
  private calls = new Map<number, Record<string, unknown>>();
  private blocks: Record<string, unknown>[] = [];
  private raw: Record<string, unknown> = { role: 'assistant', content: '' };
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
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw new Error('The provider returned a malformed stream.'); }
    const data = objectValue(parsed);
    if (data.error || data.type === 'error') throw new Error('The provider interrupted the response. Retry or check your provider account.');
    if (this.provider === 'ollama') {
      const message = objectValue(data.message ?? {});
      this.append(message.content);
      for (const call of arrayValue(message.tool_calls)) this.calls.set(this.calls.size, objectValue(call));
      if (message.thinking) this.raw.thinking = stringValue(this.raw.thinking) + stringValue(message.thinking);
      if (data.done === true) { this.ended = true; this.finishReason = stringValue(data.done_reason); }
    } else if (this.provider === 'anthropic') {
      if (data.type === 'content_block_start' || data.type === 'content_block_delta') {
        const index = data.index;
        if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index > 100) throw new Error('Invalid streamed content index.');
        if (data.type === 'content_block_start') {
          const block = objectValue(data.content_block); this.blocks[index] = { ...block };
          if (block.type === 'text') this.append(block.text);
        } else {
          const block = this.blocks[index], delta = objectValue(data.delta);
          if (!block) throw new Error('The provider returned an invalid content block.');
          if (delta.type === 'text_delta') { block.text = stringValue(block.text) + stringValue(delta.text); this.append(delta.text); }
          if (delta.type === 'input_json_delta') block.partial = stringValue(block.partial) + stringValue(delta.partial_json);
          if (delta.type === 'thinking_delta') block.thinking = stringValue(block.thinking) + stringValue(delta.thinking);
          if (delta.type === 'signature_delta') block.signature = stringValue(block.signature) + stringValue(delta.signature);
        }
      }
      if (data.type === 'message_delta') this.finishReason = stringValue(objectValue(data.delta).stop_reason);
      if (data.type === 'message_stop') this.ended = true;
    } else {
      const choices = arrayValue(data.choices);
      const choice = objectValue(choices[0] ?? {}), delta = objectValue(choice.delta ?? {});
      this.append(delta.content);
      if (delta.reasoning_details) this.raw.reasoning_details = [...arrayValue(this.raw.reasoning_details), ...arrayValue(delta.reasoning_details)];
      for (const value of arrayValue(delta.tool_calls)) {
        const call = objectValue(value), index = call.index;
        if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0 || index > 100) throw new Error('Invalid streamed tool index.');
        const prior = this.calls.get(index) ?? { type: 'function', function: { name: '', arguments: '' } };
        const fn = objectValue(prior.function), fragment = objectValue(call.function ?? {});
        if (call.id) prior.id = stringValue(call.id);
        fn.name = stringValue(fn.name) + stringValue(fragment.name);
        fn.arguments = stringValue(fn.arguments) + stringValue(fragment.arguments);
        this.calls.set(index, prior);
      }
      if (choice.finish_reason) this.finishReason = stringValue(choice.finish_reason);
    }
  }

  finish(): unknown {
    if (this.buffer) this.line(this.buffer);
    if (this.event.length) this.consume(this.event.join('\n'));
    if (!this.ended) throw new Error('The response ended early. Partial text was kept; incomplete actions were not run.');
    let data: unknown;
    if (this.provider === 'anthropic') {
      const content = this.blocks.map(block => {
        const { partial, ...rest } = block;
        if (partial !== undefined) {
          try { const input: unknown = JSON.parse(stringValue(partial)); rest.input = objectValue(input); } catch { throw new Error('The model returned incomplete tool arguments.'); }
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

/** Desktop-only transport. No redirects, credential forwarding or TLS overrides. */
export function desktopStreamTransport(provider: Provider, onText: (text: string) => void): Transport {
  return (request: HttpRequest, signal?: AbortSignal) => new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const http = new URL(request.url).protocol === 'https:' ? nodeHttps : nodeHttp;
    const collector = new ReplyStream(provider, text => { if (!signal?.aborted) onText(text); });
    let response: import('node:http').IncomingMessage | undefined;
    let settled = false;
    const finish = (error?: Error, value?: { status: number; json: unknown }) => {
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
