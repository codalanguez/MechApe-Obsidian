import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryStore, parseHistory, type ChatRecord } from '../src/history';
const chat = (id = 'a'): ChatRecord => ({ id, title: 'Draft', updated: 1, project: 'Projects/A', locked: true, draft: 'Continue here', messages: [{role:'You',content:'Hello'}] });
test('history round-trips drafts, transcript and lock without credential or tool state', async () => {
  let disk = '';
  const store = new HistoryStore(async json => { disk = json; });
  await store.save({...chat(), apiKey:'secret', tools:[{approved:true}]} as ChatRecord);
  assert.deepEqual(parseHistory(JSON.parse(disk)).chats, [chat()]);
  assert.ok(!disk.includes('secret') && !disk.includes('approved'));
});
test('history writes serialize snapshots and recover after disk failure', async () => {
  const writes: string[] = []; let calls = 0;
  const store = new HistoryStore(async json => { if (++calls === 1) throw Error('disk'); writes.push(json); });
  const first = store.save(chat());
  const second = store.save(chat('b'));
  await assert.rejects(first); await second;
  const restored = parseHistory(JSON.parse(writes[0]));
  assert.equal(restored.activeId, 'b'); assert.equal(restored.chats.length, 2);
});
test('history rejects malformed data instead of silently overwriting it', () => {
  for (const bad of [null, {}, {activeId:'a',chats:[{...chat(),messages:[{role:'tool',content:'old approval'}]}]}]) {
    assert.throws(() => parseHistory(bad));
  }
});
