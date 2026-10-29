export type Provider = 'ollama' | 'openrouter' | 'anthropic' | 'compatible';
export interface Connection { baseUrl: string; model: string; apiKey: string }
export interface Skill { id: string; name: string; instructions: string; canWrite: boolean }
export interface Settings {
  provider: Provider;
  connections: Record<Provider, Connection>;
  skills: Skill[];
  skillId: string;
  project: string;
  excludedFolders: string;
  toolsEnabled: boolean;
}
export const PROVIDERS: Record<Provider, string> = { ollama: 'Ollama', openrouter: 'OpenRouter', anthropic: 'Anthropic', compatible: 'OpenAI-compatible' };
export const DEFAULTS: Settings = {
  provider: 'ollama',
  connections: {
    ollama: { baseUrl: 'http://localhost:11434', model: '', apiKey: '' },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: '', apiKey: '' },
    anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: '', apiKey: '' },
    compatible: { baseUrl: 'http://localhost:1234/v1', model: '', apiKey: '' }
  },
  skills: [
    { id: 'assistant', name: 'Vault assistant', canWrite: true, instructions: 'Help organize and develop the user’s Obsidian vault. Find and read relevant notes before answering. Use [[wikilinks]] to connect ideas. Preserve existing YAML frontmatter and the author’s intent when editing. Keep responses practical and concise.' },
    { id: 'writer', name: 'Writer & editor', canWrite: true, instructions: 'Act as a thoughtful writing partner. Match the author’s voice, viewpoint, and tense from their existing work. Help draft scenes, essays, outlines, and revisions. Avoid generic prose and unsupported additions to established canon. For edits, preserve unrelated material and explain the purpose of the change.' },
    { id: 'research', name: 'Research librarian', canWrite: false, instructions: 'Find, compare, and synthesize evidence from the vault. Cite source notes with [[path|title]] links. Distinguish what notes actually say from your inferences and identify missing evidence. Treat contradictory sources explicitly. You are read-only: offer recommendations without changing notes.' },
    { id: 'planner', name: 'Project planner', canWrite: true, instructions: 'Help advance the selected project. Inspect project notes, identify decisions, dependencies, blockers, and actionable next steps. Use Markdown checkboxes for tasks. Preserve completed tasks. Do not invent deadlines or commitments; ask when required. Keep plans small enough to act on.' }
  ],
  skillId: 'assistant', project: '', excludedFolders: 'Templates,Private', toolsEnabled: true
};
export function loadSettings(data: Partial<Settings> | null): Settings {
  const defaults = structuredClone(DEFAULTS);
  if (!data) return defaults;
  const connections = defaults.connections;
  for (const key of Object.keys(PROVIDERS) as Provider[]) connections[key] = { ...connections[key], ...data.connections?.[key] };
  const skills = Array.isArray(data.skills) && data.skills.length ? data.skills : defaults.skills;
  return { ...defaults, ...data, connections, skills,
    provider: data.provider && data.provider in PROVIDERS ? data.provider : 'ollama',
    skillId: skills.some(s => s.id === data.skillId) ? data.skillId! : skills[0].id };
}
