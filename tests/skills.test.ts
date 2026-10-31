import test from 'node:test';
import assert from 'node:assert/strict';
import { skillQuery, searchSkills } from '../src/skill-picker';
import { DEFAULTS } from '../src/config';

test('slash skill queries use the message prefix without treating URLs or paths as commands', () => {
  assert.equal(skillQuery('/', 1), '');
  assert.equal(skillQuery('/writer', 7), 'writer');
  assert.equal(skillQuery('/writer Keep this draft', 7), 'writer');
  for (const text of ['Look at /writer', 'https://example.com', '/folder/file', '/writer\nhello']) {
    assert.equal(skillQuery(text, text.length), null);
  }
});
test('skills filter by name and id including custom skills without changing permissions', () => {
  const custom = {id:'beta',name:'Beta reader',instructions:'Read carefully',canWrite:false};
  const skills = [...DEFAULTS.skills, custom];
  assert.deepEqual(searchSkills(skills, 'BETA read'), [custom]);
  assert.equal(searchSkills(skills, 'research')[0].canWrite, false);
  assert.equal(searchSkills(skills, '').length, skills.length);
  assert.deepEqual(searchSkills(skills, 'missing'), []);
});
