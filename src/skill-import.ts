import { unzipSync } from 'fflate';
import { parseFrontmatter } from '@mechape/core/skills';
import type { Skill, SkillReference } from './config';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 400;
export interface ImportFile { path: string; data: Uint8Array }
export function referencePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (!normalized || normalized.split('/').length > 9 || normalized.split('/').some(p => !p || p === '.' || p === '..' || /[ .]$/.test(p) || /[:<>"|?*]/.test(p) || [...p].some(c => c.charCodeAt(0) < 32))) throw new Error('Unsafe reference path');
  return normalized;
}
function text(data: Uint8Array): string | null {
  if (data.includes(0)) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { return null; }
}
export function readReferences(files: ImportFile[]): { references: SkillReference[]; skipped: string[] } {
  if (files.length > MAX_FILES || files.reduce((n, f) => n + f.data.length, 0) > MAX_BYTES) throw new Error('Skill exceeds 400 files or 20 MB');
  const references: SkillReference[] = [], skipped: string[] = [], seen = new Set<string>();
  for (const file of files) {
    const path = referencePath(file.path);
    if (seen.has(path.toLowerCase())) throw new Error(`Duplicate reference: ${path}`);
    seen.add(path.toLowerCase());
    const content = /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|ico|zip|skill|exe|dll|mp[34]|wav)$/i.test(path) ? null : text(file.data);
    if (content === null) skipped.push(path); else references.push({ path, content });
  }
  return { references, skipped };
}
export function importSkillFiles(files: ImportFile[], id: string): { skill: Skill; skipped: string[] } {
  const { references, skipped } = readReferences(files);
  const roots = references.filter(f => /(^|\/)SKILL\.md$/i.test(f.path));
  const source = roots.length === 1 ? roots[0] : files.length === 1 && /\.md$/i.test(files[0].path) ? references[0] : undefined;
  if (!source || roots.length > 1) throw new Error('Choose one skill containing a SKILL.md file');
  if (!source.content.trim()) throw new Error('Skill instructions are empty');
  const prefix = source.path.slice(0, source.path.lastIndexOf('/') + 1);
  if (references.some(f => !f.path.startsWith(prefix))) throw new Error('Package contains files outside the skill folder');
  const { meta } = parseFrontmatter(source.content.replace(/^\uFEFF/, ''));
  return { skill: { id, name: (meta.name || source.path.split('/').at(-2) || source.path.replace(/\.md$/i, '')).replace(/^['"]|['"]$/g, ''),
    instructions: source.content.replace(/^\uFEFF/, ''), canWrite: false,
    references: references.filter(f => f !== source).map(f => ({ ...f, path: f.path.slice(prefix.length) })) }, skipped };
}
export function unpackSkill(data: Uint8Array): ImportFile[] {
  if (data.length > MAX_BYTES) throw new Error('Archive exceeds 20 MB');
  let count = 0, size = 0;
  const result = unzipSync(data, { filter: file => {
    if (file.name.endsWith('/')) return false;
    referencePath(file.name);
    count++; size += file.originalSize;
    if (count > MAX_FILES || size > MAX_BYTES) throw new Error('Skill exceeds 400 files or 20 MB');
    return true;
  } });
  return Object.entries(result).map(([path, data]) => ({ path, data }));
}
export async function readPickedFiles(files: File[]): Promise<ImportFile[]> {
  if (files.length > MAX_FILES || files.reduce((n, f) => n + f.size, 0) > MAX_BYTES) throw new Error('Selection exceeds 400 files or 20 MB');
  if (files.length === 1 && /\.(zip|skill)$/i.test(files[0].name)) return unpackSkill(new Uint8Array(await files[0].arrayBuffer()));
  return Promise.all(files.map(async f => ({ path: f.webkitRelativePath || f.name, data: new Uint8Array(await f.arrayBuffer()) })));
}
export function skillKnowledge(skill: Skill): string[] {
  let remaining = 32 * 1024;
  const parts: string[] = [];
  for (const ref of skill.references ?? []) {
    if (!remaining) { parts.push('[Additional skill references omitted: 32K character context limit]'); break; }
    const content = ref.content.slice(0, remaining);
    remaining -= content.length;
    parts.push(`<file path=${JSON.stringify(`${skill.name}/${ref.path}`)}>\n${content}${content.length < ref.content.length ? '\n[Reference truncated]' : ''}\n</file>`);
  }
  return parts;
}
