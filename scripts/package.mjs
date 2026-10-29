import { mkdir, copyFile, readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.version !== pkg.version) throw new Error('Package and manifest versions must match');
await mkdir('dist/mechape', { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css']) await copyFile(name, `dist/mechape/${name}`);
console.log(`Installable ${manifest.version}: dist/mechape (copy into your vault's .obsidian/plugins folder)`);
