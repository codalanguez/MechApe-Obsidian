import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recoverableReplace, parseRecovery } from '../src/recovery';
test('recovery rejects malformed, oversized, traversal and currently excluded records', () => {
  const record = { path: 'Project/note.md', before: 'original', saved: 1 };
  assert.deepEqual(parseRecovery(JSON.stringify(record), 'Private'), record);
  for (const path of ['../secret.md', '/secret.md', 'Private/secret.md', '.obsidian/data.md']) {
    assert.equal(parseRecovery(JSON.stringify({ ...record, path }), 'Private'), undefined);
  }
  assert.equal(parseRecovery('{broken', ''), undefined);
  assert.equal(parseRecovery(JSON.stringify({ ...record, before: 'x'.repeat(60001) }), ''), undefined);
});
test('replacement requires a durable recovery copy and still refuses concurrent edits', async () => {
  let note = 'original', saved = '';
  const process = async (transform: (v: string) => string) => { note = transform(note); };
  await assert.rejects(recoverableReplace(note, 'new', async () => { throw new Error('disk full'); }, process));
  assert.equal(note, 'original');
  await assert.rejects(recoverableReplace('original', 'new', async () => { saved = 'original'; note = 'human edit'; }, process), /changed during review/);
  assert.equal(note, 'human edit'); assert.equal(saved, 'original');
  await recoverableReplace(note, 'approved', async () => { saved = note; }, process);
  assert.equal(saved, 'human edit'); assert.equal(note, 'approved');
});

test('Stop during recovery backup or before the atomic transform prevents the note write', async () => {
  for (const when of ['backup', 'process']) {
    const controller = new AbortController(); let note = 'original';
    await assert.rejects(recoverableReplace('original', 'changed', async () => {
      if (when === 'backup') controller.abort();
    }, async transform => {
      if (when === 'process') controller.abort();
      note = transform(note);
    }, controller.signal));
    assert.equal(note, 'original');
  }
});
