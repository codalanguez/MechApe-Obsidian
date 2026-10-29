import type { Connection, Provider } from './config';
export interface ToolDefinition { name: string; description: string; parameters: Record<string, unknown> }
export interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }
export interface Message {
  role: 'user' | 'assistant' | 'tool'; content: string;
  calls?: ToolCall[]; callId?: string; name?: string; raw?: Record<string, unknown>;
}
export interface HttpRequest { url: string; method: string; headers: Record<string, string>; body?: string }
export type Transport = (request: HttpRequest) => Promise<{ status: number; json: any }>;
export function endpoint(base: string, path: string): string {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) API base URL without credentials, query, or fragment.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Remote API endpoints must use HTTPS.');
  return base.replace(/\/+$/, '') + path;
}
function wireMessages(provider: Provider, messages: Message[]): any[] {
  if (provider === 'anthropic') {
    const output: any[] = [];
    for (const m of messages) {
      const role = m.role === 'tool' ? 'user' : m.role;
      const content = m.role === 'tool' ? [{ type: 'tool_result', tool_use_id: m.callId, content: m.content }]
        : m.raw?.content ?? [{ type: 'text', text: m.content }];
      if (output.at(-1)?.role === role) output.at(-1).content.push(...content as any[]);
      else output.push({ role, content });
    }
    return output;
  }
  return messages.map(m => {
    if (m.role === 'assistant' && m.raw) return m.raw;
    if (m.role === 'tool') return provider === 'ollama'
      ? { role: 'tool', content: m.content, tool_name: m.name }
      : { role: 'tool', content: m.content, tool_call_id: m.callId };
    return { role: m.role, content: m.content };
  });
}
export function makeRequest(provider: Provider, connection: Connection, system: string, messages: Message[], tools: ToolDefinition[]): HttpRequest {
  if (!connection.model.trim()) throw new Error('Choose a model in MechApe settings first.');
  if (['anthropic', 'openrouter'].includes(provider) && !connection.apiKey.trim()) throw new Error('Add your API key in MechApe settings.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: Record<string, unknown>;
  let path: string;
  if (provider === 'anthropic') {
    headers['x-api-key'] = connection.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    path = '/messages';
    body = { model: connection.model, max_tokens: 4096, system, messages: wireMessages(provider, messages) };
    if (tools.length) body.tools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  } else {
    if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
    if (provider === 'openrouter') { headers['HTTP-Referer'] = 'https://github.com/codalanguez/MechApe'; headers['X-Title'] = 'MechApe for Obsidian'; }
    path = provider === 'ollama' ? '/api/chat' : '/chat/completions';
    body = { model: connection.model, stream: false, messages: [{ role: 'system', content: system }, ...wireMessages(provider, messages)] };
    if (provider === 'ollama') body.options = { num_predict: 4096 };
    else body.max_tokens = 4096;
    if (tools.length) body.tools = tools.map(t => ({ type: 'function', function: t }));
  }
  return { url: endpoint(connection.baseUrl, path), method: 'POST', headers, body: JSON.stringify(body) };
}
export function parseResponse(provider: Provider, data: any): Message {
  const raw = provider === 'anthropic' ? { role: 'assistant', content: data.content } : provider === 'ollama' ? data.message : data.choices?.[0]?.message;
  if (!raw || raw.role !== 'assistant') throw new Error('The provider returned no assistant message. Check the endpoint and model.');
  if (data.stop_reason === 'max_tokens' || data.choices?.[0]?.finish_reason === 'length' || data.done_reason === 'length') throw new Error('The model hit its output limit. Ask for a smaller change; no incomplete tool calls were applied.');
  const content = provider === 'anthropic' ? (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') : raw.content ?? '';
  const source = provider === 'anthropic' ? data.content.filter((b: any) => b.type === 'tool_use') : raw.tool_calls ?? [];
  const calls = source.map((c: any, i: number) => {
    let args = provider === 'anthropic' ? c.input : c.function?.arguments;
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { throw new Error('The model returned invalid tool arguments. Try again or choose a tool-capable model.'); } }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('The model returned invalid tool arguments.');
    return { id: c.id ?? `call_${i}`, name: provider === 'anthropic' ? c.name : c.function.name, arguments: args };
  });
  if (!content && !calls.length) throw new Error('The model returned an empty reply. Try again or choose a different model.');
  return { role: 'assistant', content, calls, raw };
}
export async function send(transport: Transport, request: HttpRequest, signal: AbortSignal): Promise<any> {
  signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout>;
  let abort: () => void = () => {};
  const guard = new Promise<never>((_, reject) => {
    abort = () => reject(new Error('Stopped.'));
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => reject(new Error('The provider timed out after 120 seconds. Try a smaller model or prompt.')), 120000);
  });
  try {
    const response = await Promise.race([transport(request), guard]);
    signal.throwIfAborted();
    if (response.status >= 400) throw new Error(`Provider HTTP ${response.status}. ${response.status === 401 || response.status === 403 ? 'Check your API key and access.' : response.status === 429 ? 'Rate limit or credit limit reached; retry later.' : 'Check your model, API base URL, and tool support.'}`);
    return response.json;
  } finally { clearTimeout(timer!); signal.removeEventListener('abort', abort); }
}
export async function listModels(provider: Provider, connection: Connection, transport: Transport, signal: AbortSignal): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (provider === 'anthropic') { headers['x-api-key'] = connection.apiKey; headers['anthropic-version'] = '2023-06-01'; }
  else if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
  const response = await send(transport, { url: endpoint(connection.baseUrl, provider === 'ollama' ? '/api/tags' : '/models'), method: 'GET', headers }, signal);
  return (provider === 'ollama' ? response.models ?? [] : response.data ?? []).map((m: any) => m.id ?? m.name).filter((m: any) => typeof m === 'string').sort();
}
