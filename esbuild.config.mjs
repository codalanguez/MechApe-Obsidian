import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const coreLicense = fs.readFileSync(path.join(path.dirname(require.resolve('@mechape/core/package.json')), 'LICENSE'), 'utf8');
import esbuild from 'esbuild';
const options = { entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian', 'node:http', 'node:https'], format: 'cjs', target: 'es2020', outfile: 'main.js', sourcemap: false, banner: { js: '/*! @mechape/core — MIT\n' + coreLicense + '\n*/' }, logLevel: 'info' };
if (process.argv.includes('--watch')) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
