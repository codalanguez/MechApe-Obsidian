import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchProjects, currentProject, newProjectPath } from '../src/projects';

test('project search matches words anywhere in full paths, ignores case, and ranks exact names', () => {
  const paths = ['Stories/Novel/Drafts', 'Stories/Drafts/Novel', 'Projects/Other', 'Private/Novel', '.obsidian/Novel'];
  assert.deepEqual(searchProjects(paths, 'NOVEL stories', 'Private'), ['Stories/Drafts/Novel', 'Stories/Novel/Drafts']);
  assert.deepEqual(searchProjects(paths, 'Novel', 'Private'), ['Stories/Drafts/Novel', 'Stories/Novel/Drafts']);
  assert.deepEqual(searchProjects(paths, 'absent', ''), []);
});
test('current project preserves selected ancestor or uses active note folder without prefix collisions', () => {
  assert.equal(currentProject('Stories/Novel/Drafts/Scene.md', 'Stories/Novel'), 'Stories/Novel');
  assert.equal(currentProject('Stories/Novel 2/Scene.md', 'Stories/Novel'), 'Stories/Novel 2');
  assert.equal(currentProject('Note.md', 'Stories'), '');
  assert.equal(currentProject(undefined, 'Stories'), undefined);
});
test('new projects reject hidden, traversal, invalid and excluded paths', () => {
  assert.equal(newProjectPath(' Projects/My novel ', 'Private'), 'Projects/My novel');
  for (const path of ['', '../Other', '.obsidian/new', 'Projects/.hidden', '/absolute', 'Private/new', 'private/New', 'A:*']) {
    assert.throws(() => newProjectPath(path, 'Private'), path);
  }
  assert.equal(newProjectPath('Private fiction', 'Private'), 'Private fiction');
});
