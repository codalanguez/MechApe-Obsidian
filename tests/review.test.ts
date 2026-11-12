import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedLines, providerHelp } from '../src/review';
test('review exposes deletions and additions without dropping frontmatter', () => {
  const d = changedLines('---\ntitle: Story\n---\nold\nend', '---\ntitle: Story\n---\nnew\nend');
  assert.match(d, /- old/); assert.match(d, /\+ new/); assert.match(d, /title: Story/);
  assert.equal(changedLines('same', 'same'), 'No changes.');
});
test('provider help distinguishes billing from rate limits', () => {
  assert.match(providerHelp('402 credits exhausted'), /billed separately/);
  assert.match(providerHelp('429'), /limiting/);
});
