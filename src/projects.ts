import { safePath, within } from './vault-tools';

export function allowedProject(path: string, excluded: string): boolean {
  try {
    safePath(path, true);
    return !excluded.split(',').map(s => s.trim()).filter(Boolean)
      .some(folder => within(path.toLowerCase(), safePath(folder, true).toLowerCase()));
  } catch { return false; }
}

export function searchProjects(paths: string[], query: string, excluded: string): string[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return [...new Set(paths)].filter(path => path && allowedProject(path, excluded)
    && terms.every(term => path.toLowerCase().includes(term)))
    .sort((a, b) => {
      const nameA = a.split('/').pop()!.toLowerCase();
      const nameB = b.split('/').pop()!.toLowerCase();
      const exact = query.trim().toLowerCase();
      return Number(nameB === exact) - Number(nameA === exact) || a.localeCompare(b);
    });
}

export function currentProject(activeNote: string | undefined, selected: string): string | undefined {
  if (!activeNote) return undefined;
  if (selected && within(activeNote, selected)) return selected;
  return activeNote.includes('/') ? activeNote.slice(0, activeNote.lastIndexOf('/')) : '';
}

export function newProjectPath(value: string, excluded: string): string {
  const path = safePath(value, true);
  if (!path) throw new Error('Enter a name or vault-relative folder path.');
  if (!allowedProject(path, excluded)) throw new Error('Choose a folder outside the excluded folders.');
  return path;
}
