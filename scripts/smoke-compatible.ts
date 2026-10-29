// Manual local integration check. No vault files or credentials are read.
import assert from 'node:assert/strict';
import { loadSettings } from '../src/config';
import { listModels, type Transport } from '../src/providers';
import { runAgent } from '../src/agent';
import { VaultTools } from '../src/vault-tools';

const transport: Transport = async request => {
  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
  return { status: response.status, json: response.ok ? await response.json() : {} };
};
async function main() {
  const settings = loadSettings(null);
  settings.provider = 'compatible';
  settings.project = 'Test';
  settings.connections.compatible = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b', apiKey: '' };
  const models = await listModels('compatible', settings.connections.compatible, transport, new AbortController().signal);
  assert.ok(models.includes('qwen2.5:7b'), 'The local compatible model catalog must include the selected model.');
  let reads = 0;
  const tools = new VaultTools({
    files: () => [{ path: 'Test/Fixture.md' }], exists: () => true,
    read: async path => { assert.equal(path, 'Test/Fixture.md'); reads++; return 'The test marker is violet-maple-42.'; },
    create: async () => { throw new Error('Read-only smoke test'); },
    replace: async () => { throw new Error('Read-only smoke test'); }
  }, 'Test', [], false, async () => false);
  const result = await runAgent({ settings, skill: settings.skills.find(s => s.id === 'research')!, tools, transport,
    signal: new AbortController().signal,
    messages: [{ role: 'user', content: 'Use read_note to read Test/Fixture.md, then return the test marker from that note. Do not guess.' }],
    onText: async () => {}, onActivity: text => console.log(text)
  });
  assert.ok(reads > 0, 'Model must actually call the read tool.');
  assert.match(result.at(-1)!.content, /violet-maple-42/);
  console.log('PASS: live OpenAI-compatible model discovery, tool call, result round trip, and answer. Synthetic fixture only.');
}
main().catch(() => { console.error('FAIL: local compatible smoke test did not complete successfully.'); process.exitCode = 1; });
