import fs from 'node:fs';
import crypto from 'node:crypto';
const root = new URL('../src/core/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
const expected = ['LICENSE', 'openrouter.d.ts', 'openrouter.js', 'prompt.d.ts', 'prompt.js', 'skills.d.ts', 'skills.js'];
if (JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify(expected)) throw new Error('Unexpected shared-core manifest');
for (const [file, hash] of Object.entries(manifest.files)) {
  const source = fs.readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');
  if (crypto.createHash('sha256').update(source).digest('hex') !== hash) throw new Error(`Shared core drift: ${file}. Sync from the desktop core.`);
}
console.log('MechApe shared-core checksums verified.');
