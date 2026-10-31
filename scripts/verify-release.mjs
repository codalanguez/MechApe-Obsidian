import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const manifest = await readJson('manifest.json');
const pkg = await readJson('package.json');
const versions = await readJson('versions.json');
assert.match(manifest.id, /^[a-z0-9-]+$/);
assert.ok(!manifest.id.includes('obsidian'));
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith('.'));
assert.equal(typeof manifest.isDesktopOnly, 'boolean');
for (const file of ['README.md', 'LICENSE', 'RELEASING.md']) assert.ok((await readFile(file, 'utf8')).trim());
const bundle = await readFile('main.js', 'utf8');
const dependencies = [...bundle.matchAll(/require\(["']([^"']+)["']\)/g)].map(match => match[1]);
assert.deepEqual([...new Set(dependencies)].sort(), ['node:http', 'node:https', 'obsidian'], 'Only Obsidian and the desktop streaming built-ins may remain external.');
assert.equal(manifest.isDesktopOnly, true, 'Node streaming requires a desktop-only manifest.');
assert.ok(!/StudioConnection|studio-send|studio-retrieve|Leave a tip on PayPal/.test(bundle), 'Exclude unfinished Studio integration and in-plugin donation links.');
const hashes = [];
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  const bytes = await readFile(file);
  assert.ok(bytes.length);
  assert.deepEqual(await readFile(`dist/mechape/${file}`), bytes, 'Installable package must match source build.');
  hashes.push(`${createHash('sha256').update(bytes).digest('hex')}  ${file}`);
}
await writeFile('dist/SHA256SUMS.txt', hashes.join('\n') + '\n');
console.log(`Release ${manifest.version} verified: metadata, runtime imports, package contents, SHA256 sums.`);
