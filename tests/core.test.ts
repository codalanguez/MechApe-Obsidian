import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, loadSettings } from '../src/config';
import { endpoint, makeRequest, parseResponse, send } from '../src/providers';
import { VaultTools, safePath, type VaultAccess } from '../src/vault-tools';
import { runAgent } from '../src/agent';

function fixture(canWrite = true, review: (change: any) => Promise<boolean> = async () => true) {
  const files = new Map([['Projects/Alpha.md', '# Alpha\nOriginal'], ['Projects/Beta.md', '# Beta\nA task'], ['Private/Secret.md', 'secret'], ['Elsewhere.md', 'outside']]);
  const vault: VaultAccess = {
    files: () => [...files.keys()].map(path => ({ path })), exists: path => files.has(path),
    read: async path => { if (!files.has(path)) throw new Error('Missing'); return files.get(path)!; },
    create: async (path, content) => { if (files.has(path)) throw new Error('Exists'); files.set(path, content); },
    replace: async (path, before, after) => { if (files.get(path) !== before) throw new Error('Stale'); files.set(path, after); }
  };
  const tools = new VaultTools(vault, 'Projects', ['Private'], canWrite, review);
  const call = async (name: string, args: Record<string, unknown>) => JSON.parse(await tools.execute({ id: '1', name, arguments: args }, new AbortController().signal));
  return { files, tools, call, vault };
}
test('paths reject hidden files, traversal, absolute paths, and non-Markdown', () => {
  for (const path of ['../a.md', 'Projects/../a.md', '.obsidian/a.md', 'C:\\a.md', '/a.md', 'a.txt', 'a//b.md', 'a/.hidden/b.md']) assert.throws(() => safePath(path));
  assert.equal(safePath('Projects\\A.md'), 'Projects/A.md');
});
test('project boundary is enforced for listing, search, read and write', async () => {
  const { call, files } = fixture();
  assert.deepEqual((await call('list_notes', {})).paths, ['Projects/Alpha.md', 'Projects/Beta.md']);
  assert.equal((await call('read_note', { path: 'Elsewhere.md' })).status, 'error');
  assert.equal((await call('create_note', { path: 'ProjectsOther/New.md', content: 'no' })).status, 'error');
  assert.equal((await call('search_notes', { query: 'secret' })).hits.length, 0);
  assert.equal(files.size, 4);
});
test('writes require read, approval and matching original; create never overwrites', async () => {
  const { call, files } = fixture();
  assert.equal((await call('update_note', { path: 'Projects/Alpha.md', content: 'new' })).status, 'error');
  await call('read_note', { path: 'Projects/Alpha.md' });
  assert.equal((await call('update_note', { path: 'Projects/Alpha.md', content: 'new' })).status, 'applied');
  assert.equal(files.get('Projects/Alpha.md'), 'new');
  assert.equal((await call('create_note', { path: 'Projects/Alpha.md', content: 'overwrite' })).status, 'error');
  assert.equal((await call('create_note', { path: 'Projects/New.md', content: '# New' })).status, 'applied');
});
test('a rejected change never mutates a note', async () => {
  const { call, files } = fixture(true, async () => false);
  await call('read_note', { path: 'Projects/Alpha.md' });
  assert.equal((await call('update_note', { path: 'Projects/Alpha.md', content: 'new' })).status, 'rejected');
  assert.equal(files.get('Projects/Alpha.md'), '# Alpha\nOriginal');
});
test('concurrent edit during review is preserved', async () => {
  const f = fixture(true, async () => { f.files.set('Projects/Alpha.md', 'user edit'); return true; });
  await f.call('read_note', { path: 'Projects/Alpha.md' });
  assert.equal((await f.call('update_note', { path: 'Projects/Alpha.md', content: 'AI edit' })).status, 'error');
  assert.equal(f.files.get('Projects/Alpha.md'), 'user edit');
});
test('read-only skill removes write definitions and rejects direct write calls', async () => {
  const { call, tools } = fixture(false);
  assert.equal(tools.definitions().length, 3);
  assert.equal((await call('create_note', { path: 'Projects/New.md', content: 'new' })).status, 'error');
});
test('cancellation while reviewing prevents a write even if approval resolves true', async () => {
  const controller = new AbortController();
  const { tools, files } = fixture(true, async () => { controller.abort(); return true; });
  await assert.rejects(tools.execute({ id: '1', name: 'create_note', arguments: { path: 'Projects/New.md', content: 'new' } }, controller.signal));
  assert.equal(files.has('Projects/New.md'), false);
});
test('provider formats and tool round trips preserve provider-specific metadata', () => {
  for (const provider of ['ollama', 'openrouter', 'anthropic', 'compatible'] as const) {
    const connection = { ...DEFAULTS.connections[provider], model: 'test-model', apiKey: 'test-key' };
    const data = provider === 'anthropic' ? { content: [{ type: 'tool_use', id: 't1', name: 'read_note', input: { path: 'A.md' } }] }
      : provider === 'ollama' ? { message: { role: 'assistant', content: '', thinking: 'metadata', tool_calls: [{ function: { name: 'read_note', arguments: { path: 'A.md' } } }] } }
      : { choices: [{ message: { role: 'assistant', content: null, reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque' }], tool_calls: [{ id: 't1', type: 'function', function: { name: 'read_note', arguments: '{"path":"A.md"}' } }] } }] };
    const parsed = parseResponse(provider, data);
    assert.equal(parsed.calls?.[0].arguments.path, 'A.md');
    const request = makeRequest(provider, connection, 'system', [{ role: 'user', content: 'Read A' }, parsed, { role: 'tool', content: 'note', name: 'read_note', callId: parsed.calls![0].id }], fixture().tools.definitions());
    const body = JSON.parse(request.body!);
    if (provider === 'anthropic') { assert.equal(body.system, 'system'); assert.equal(body.messages.at(-1).content[0].tool_use_id, 't1'); assert.ok(body.tools[0].input_schema); }
    else { assert.equal(body.messages[0].role, 'system'); assert.ok(body.tools[0].function.parameters); assert.deepEqual(body.messages[2], parsed.raw); }
  }
});
test('invalid or truncated tool output is rejected before use', () => {
  assert.throws(() => parseResponse('openrouter', { choices: [{ message: { role: 'assistant', tool_calls: [{ function: { name: 'a', arguments: '{broken' } }] } }] }));
  assert.throws(() => parseResponse('anthropic', { stop_reason: 'max_tokens', content: [] }));
});
test('remote plaintext and credential-bearing endpoint URLs are rejected', () => {
  assert.throws(() => endpoint('http://remote.example/v1', '/models'));
  assert.throws(() => endpoint('https://key:secret@example.org', '/models'));
  assert.equal(endpoint('http://localhost:11434/', '/api/chat'), 'http://localhost:11434/api/chat');
});
test('stop returns promptly while a non-abortable transport is still pending', async () => {
  const controller = new AbortController();
  const promise = send(() => new Promise(() => {}), { url: 'http://localhost', method: 'GET', headers: {} }, controller.signal);
  controller.abort(); await assert.rejects(promise, /Stopped/);
});
test('settings migrations retain defaults and custom profiles', () => {
  const settings = loadSettings({ skills: [{ id: 'custom', name: 'Custom', instructions: 'test', canWrite: false }] });
  assert.equal(settings.skillId, 'custom'); assert.equal(settings.connections.ollama.baseUrl, DEFAULTS.connections.ollama.baseUrl);
});
test('agent executes a read tool and supplies its result on the next model request', async () => {
  const settings = loadSettings(null); settings.connections.ollama.model = 'test'; settings.project = 'Projects';
  let count = 0;
  const result = await runAgent({ settings, skill: settings.skills[0], tools: fixture().tools, signal: new AbortController().signal, messages: [{ role: 'user', content: 'Read Alpha' }], onText: async () => {}, onActivity: () => {}, transport: async request => {
    count++;
    if (count === 1) return { status: 200, json: { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_note', arguments: { path: 'Projects/Alpha.md' } } }] } } };
    const messages = JSON.parse(request.body!).messages;
    assert.match(messages.at(-1).content, /Original/);
    return { status: 200, json: { message: { role: 'assistant', content: 'Here is Alpha.' } } };
  } });
  assert.equal(count, 2); assert.equal(result.at(-1)?.content, 'Here is Alpha.');
});
