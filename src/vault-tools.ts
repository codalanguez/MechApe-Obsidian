import type { ToolCall, ToolDefinition } from './providers';
export interface Note { path: string }
export interface VaultAccess {
  files(): Note[];
  read(path: string): Promise<string>;
  exists(path: string): boolean;
  create(path: string, content: string): Promise<void>;
  replace(path: string, before: string, after: string): Promise<void>;
}
export interface Change { path: string; before: string | null; after: string }
export type Review = (change: Change, signal: AbortSignal) => Promise<boolean>;
const MAX_NOTE = 60000;
export function safePath(value: unknown, folder = false): string {
  if (typeof value !== 'string') throw new Error('A vault-relative path is required.');
  const path = value.trim().replace(/\\/g, '/').replace(/\/$/, '');
  if (!path && folder) return '';
  if (!path || path.startsWith('/') || (path.includes(':') || Array.from(path).some(char => char.charCodeAt(0) < 32)) || path.split('/').some(p => !p || p.startsWith('.') || /[<>"|?*]/.test(p))) throw new Error('Use a vault-relative path without hidden folders or traversal.');
  if (!folder && !path.toLowerCase().endsWith('.md')) throw new Error('Only Markdown notes (.md) are supported.');
  return path;
}
export function within(path: string, folder: string): boolean { return !folder || path === folder || path.startsWith(folder + '/'); }
export class VaultTools {
  private snapshots = new Map<string, string>();
  constructor(private vault: VaultAccess, readonly project: string, private excluded: string[], readonly canWrite: boolean, private review: Review) { safePath(project, true); }
  allowed(path: string): boolean {
    try { safePath(path); } catch { return false; }
    return within(path, this.project) && !this.excluded.some(folder => within(path.toLowerCase(), folder.toLowerCase()));
  }
  private path(value: unknown): string { const path = safePath(value); if (!this.allowed(path)) throw new Error('This note is outside the selected project or is excluded.'); return path; }
  definitions(): ToolDefinition[] {
    const str = { type: 'string' };
    const def = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDefinition => ({ name, description, parameters: { type: 'object', properties, required, additionalProperties: false } });
    return [
      def('list_notes', 'List Markdown paths in the selected project. Paginate with offset; all paths are relative to the vault root.', { folder: str, offset: { type: 'integer', minimum: 0 } }, []),
      def('search_notes', 'Search note names and text for a literal phrase in the selected project. Returns excerpts and paths; use read_note before editing.', { query: str, offset: { type: 'integer', minimum: 0 } }, ['query']),
      def('read_note', 'Read a complete Markdown note (up to 60,000 characters) before answering or editing it.', { path: str }, ['path']),
      ...(this.canWrite ? [
        def('create_note', 'Propose a new Markdown note for user approval. Parent folders are created if needed. Never overwrites an existing note.', { path: str, content: str }, ['path', 'content']),
        def('update_note', 'Propose replacing a previously read note. Include the complete new Markdown, preserving frontmatter and unrelated text. Requires user approval and refuses stale edits.', { path: str, content: str }, ['path', 'content'])
      ] : [])
    ];
  }
  async execute(call: ToolCall, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    try {
      const a = call.arguments;
      const files = this.vault.files().filter(f => this.allowed(f.path)).sort((a, b) => a.path.localeCompare(b.path));
      const offset = typeof a.offset === 'number' && Number.isInteger(a.offset) && a.offset >= 0 ? a.offset : 0;
      if (call.name === 'list_notes') {
        const folder = a.folder === undefined ? this.project : safePath(a.folder, true);
        const matches = files.filter(f => within(f.path, folder));
        return JSON.stringify({ paths: matches.slice(offset, offset + 100).map(f => f.path), total: matches.length, nextOffset: offset + 100 < matches.length ? offset + 100 : null });
      }
      if (call.name === 'search_notes') {
        if (typeof a.query !== 'string' || !a.query.trim()) throw new Error('Provide a nonempty search phrase.');
        const query = a.query.toLowerCase();
        const hits: { path: string; excerpt: string }[] = [];
        let scanned = offset;
        for (const file of files.slice(offset, offset + 300)) {
          signal.throwIfAborted(); scanned++;
          const content = await this.vault.read(file.path);
          const index = content.toLowerCase().indexOf(query);
          if (index >= 0 || file.path.toLowerCase().includes(query)) hits.push({ path: file.path, excerpt: content.slice(Math.max(0, index - 100), Math.max(0, index - 100) + 350) });
          if (hits.length >= 20) break;
        }
        return JSON.stringify({ hits, nextOffset: scanned < files.length ? scanned : null });
      }
      const path = this.path(a.path);
      if (call.name === 'read_note') {
        const content = await this.vault.read(path);
        if (content.length > MAX_NOTE) throw new Error('This note exceeds 60,000 characters. Split it into smaller notes to work with it.');
        this.snapshots.set(path, content);
        return JSON.stringify({ path, content });
      }
      if (!['create_note', 'update_note'].includes(call.name)) throw new Error('Unknown tool.');
      if (!this.canWrite) throw new Error('This skill is read-only.');
      if (typeof a.content !== 'string' || a.content.length > MAX_NOTE) throw new Error('Note content must be a string of at most 60,000 characters.');
      const before = call.name === 'create_note' ? null : this.snapshots.get(path);
      if (before === undefined) throw new Error('Read the note before proposing an update.');
      if (before === null && this.vault.exists(path)) throw new Error('A file already exists at this path.');
      if (before !== null && await this.vault.read(path) !== before) throw new Error('The note changed since it was read. Read it again before editing.');
      const accepted = await this.review({ path, before, after: a.content }, signal);
      signal.throwIfAborted();
      if (!accepted) return JSON.stringify({ status: 'rejected', path, message: 'User rejected this change. Do not retry unless asked.' });
      if (before === null) await this.vault.create(path, a.content);
      else await this.vault.replace(path, before, a.content);
      this.snapshots.set(path, a.content);
      return JSON.stringify({ status: 'applied', path });
    } catch (error) {
      signal.throwIfAborted();
      return JSON.stringify({ status: 'error', message: error instanceof Error ? error.message : 'Tool failed.' });
    }
  }
}
