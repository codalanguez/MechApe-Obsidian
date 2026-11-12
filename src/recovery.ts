import { safePath } from './vault-tools';
import { allowedProject } from './projects';

export function parseRecovery(raw: string, excluded: string): { path: string; before: string; saved: number } | undefined {
  if (raw.length > 400000) return undefined;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data.before !== 'string' || data.before.length > 60000
      || typeof data.saved !== 'number' || !Number.isFinite(data.saved)) return undefined;
    const path = safePath(data.path);
    if (!allowedProject(path, excluded)) return undefined;
    return { path, before: data.before, saved: data.saved };
  } catch { return undefined; }
}

/** A recovery write must succeed before the atomic stale-checked replacement. */
export async function recoverableReplace(before: string, after: string,
  backup: () => Promise<void>, process: (transform: (current: string) => string) => Promise<unknown>, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await backup();
  signal?.throwIfAborted();
  await process(current => {
    signal?.throwIfAborted();
    if (current !== before) throw new Error('The note changed during review. Read it again and make a fresh proposal.');
    return after;
  });
}
