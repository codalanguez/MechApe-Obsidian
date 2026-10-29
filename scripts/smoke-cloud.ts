// Manual authenticated integration test. Keys stay in memory; only synthetic notes are sent.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadSettings, type Provider } from '../src/config';
import { listModels, safeErrorData, type Transport } from '../src/providers';
import { runAgent } from '../src/agent';
import { VaultTools } from '../src/vault-tools';
const transport: Transport = async request => {
  const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
  const text = await response.text();
  return { status: response.status, json: response.ok ? JSON.parse(text) : safeErrorData(text) };
};
async function main() {
  const settings = loadSettings(JSON.parse(await readFile(process.env.MECHAPE_SETTINGS!, 'utf8')));
  for (const provider of ['openrouter', 'anthropic'] as Provider[]) {
    if (process.env.MECHAPE_PROVIDER && provider !== process.env.MECHAPE_PROVIDER) continue;
    settings.provider = provider;
    settings.project = 'Test';
    const connection = settings.connections[provider];
    const models = await listModels(provider, connection, transport, new AbortController().signal);
    if (process.argv.includes('--catalog')) {
      console.log(provider, JSON.stringify(models.filter(m => /claude.*(haiku|sonnet)/.test(m))), 'selected:', connection.model);
      continue;
    }
    if (provider === 'openrouter' && process.env.MECHAPE_OPENROUTER_MODEL) connection.model = process.env.MECHAPE_OPENROUTER_MODEL;
    assert.ok(models.includes(connection.model), `${provider}: configured model not present in catalog`);
    const notes = new Map([['Test/Fixture.md', 'The marker is violet-maple-42.']]);
    const calls: string[] = [];
    let reviews = 0;
    const tools = new VaultTools({
      files: () => [...notes.keys()].map(path => ({path})), exists: path => notes.has(path),
      read: async path => { assert.ok(notes.has(path)); return notes.get(path)!; },
      create: async (path, content) => { assert.equal(notes.has(path), false); notes.set(path, content); },
      replace: async (path, before, after) => { assert.equal(notes.get(path), before); notes.set(path, after); }
    }, 'Test', [], true, async change => { assert.equal(change.path, 'Test/Cloud.md'); reviews++; return true; });
    const execute = tools.execute.bind(tools);
    tools.execute = async (call, signal) => { calls.push(call.name); return execute(call, signal); };
    const result = await runAgent({settings, skill: settings.skills.find(s=>s.id==='assistant')!, tools, transport,
      signal: new AbortController().signal, onText: async()=>{}, onActivity: ()=>{},
      messages: [{role:'user', content:'Use tools to read Test/Fixture.md. Create Test/Cloud.md containing exactly the marker from the fixture. After creation succeeds, read Test/Cloud.md, then update it to exactly the string inside these brackets (without brackets): [violet-maple-42 updated]. Finally report the marker. Perform all steps; this is an integration test.'}]
    });
    assert.ok(calls.includes('read_note') && calls.includes('create_note') && calls.includes('update_note'));
    assert.equal(reviews, 2);
    assert.equal(notes.get('Test/Cloud.md')?.trim(), 'violet-maple-42 updated');
    assert.match(result.at(-1)!.content, /violet-maple-42/);
    console.log(`PASS ${provider} ${connection.model}: catalog, read/create/update, two review callbacks, tool results and final answer. Synthetic memory fixture only.`);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Cloud smoke test failed'); process.exitCode = 1; });
