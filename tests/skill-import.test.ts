import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { importSkillFiles, readReferences, unpackSkill, skillKnowledge } from '../src/skill-import';
import { systemPrompt } from '../src/agent';
import { loadSettings, persistedSettings, DEFAULTS } from '../src/config';
const file = (path: string, content: string) => ({ path, data: strToU8(content) });

test('Claude-style package preserves nested references, metadata and defaults to read-only', () => {
  const zip = zipSync({ 'example/SKILL.md': strToU8('---\nname: "Example"\nallowed-tools: Bash\n---\nUse references/canon.md.'), 'example/references/canon.md': strToU8('The city is named Coda.') });
  const { skill } = importSkillFiles(unpackSkill(zip), 'unique');
  assert.equal(skill.name, 'Example'); assert.equal(skill.canWrite, false);
  assert.match(skill.instructions, /allowed-tools: Bash/);
  assert.deepEqual(skill.references, [{ path: 'references/canon.md', content: 'The city is named Coda.' }]);
  const prompt = systemPrompt(skill, '');
  assert.match(prompt, /The city is named Coda/);
  assert.match(prompt, /untrusted reference data/);
  assert.match(prompt, /read-only/);
  const settings = loadSettings(persistedSettings({ ...structuredClone(DEFAULTS), skills: [skill], skillId: skill.id }));
  assert.deepEqual(settings.skills[0], skill);
});
test('plain markdown imports and binary files are reported instead of decoded as instructions', () => {
  assert.equal(importSkillFiles([file('editor.md', 'Edit carefully')], 'a').skill.name, 'editor');
  const result = importSkillFiles([file('SKILL.md', 'Read'), { path: 'image.png', data: new Uint8Array([0, 1, 2]) }], 'a');
  assert.deepEqual(result.skipped, ['image.png']);
});
test('unsafe, ambiguous, duplicate and oversized imports fail before saving', () => {
  for (const path of ['../outside.md', '/absolute.md', 'C:/secret.md', 'refs/../../secret.md']) {
    assert.throws(() => readReferences([file(path, 'data')]), /Unsafe/);
  }
  assert.throws(() => readReferences([file('a.md', 'a'), file('A.md', 'b')]), /Duplicate/);
  assert.throws(() => importSkillFiles([file('one/SKILL.md', 'one'), file('two/SKILL.md', 'two')], 'a'), /one skill/);
  assert.throws(() => unpackSkill(zipSync({ 'SKILL.md': strToU8('Read'), 'big.txt': new Uint8Array(21 * 1024 * 1024) })), /20 MB/);
  assert.throws(() => importSkillFiles([file('SKILL.md', '')], 'a'), /empty/);
});
test('references have a bounded prompt budget with explicit truncation', () => {
  const skill = { id: 'a', name: 'A', instructions: 'Read', canWrite: false, references: [{ path: 'long.md', content: 'x'.repeat(40000) }, { path: 'next.md', content: 'not included' }] };
  const knowledge = skillKnowledge(skill).join('\n');
  assert.match(knowledge, /Reference truncated/); assert.match(knowledge, /Additional skill references omitted/);
  assert.ok(knowledge.length < 34000); assert.ok(!knowledge.includes('not included'));
});
