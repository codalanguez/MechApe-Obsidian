export interface ChatRecord {
  id: string;
  title: string;
  updated: number;
  project: string;
  locked: boolean;
  draft: string;
  messages: { role: string; content: string }[];
}
export interface ChatHistory { activeId: string; chats: ChatRecord[] }
export function newChatId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Deliberately stores only display text: no keys, tool calls, tool results or approval state. */
export function parseHistory(raw: unknown): ChatHistory {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid chat history');
  const data = raw as ChatHistory;
  if (!Array.isArray(data.chats) || typeof data.activeId !== 'string') throw new Error('Invalid chat history');
  const chats = data.chats.map(chat => {
    if (!chat || typeof chat.id !== 'string' || typeof chat.project !== 'string' || typeof chat.draft !== 'string'
      || typeof chat.title !== 'string' || typeof chat.updated !== 'number' || !Array.isArray(chat.messages)
      || !chat.messages.every(m => m && ['You', 'MechApe', 'Status'].includes(m.role) && typeof m.content === 'string'))
      throw new Error('Invalid chat history');
    return { id: chat.id, title: chat.title, updated: chat.updated, project: chat.project, locked: chat.locked === true,
      draft: chat.draft, messages: chat.messages.map(m => ({ role: m.role, content: m.content })) };
  });
  return { activeId: data.activeId, chats };
}

export class HistoryStore {
  state: ChatHistory = { activeId: '', chats: [] };
  private queue: Promise<void> = Promise.resolve();
  constructor(private write: (json: string) => Promise<void>) {}
  save(chat: ChatRecord): Promise<void> {
    const clean = parseHistory({ activeId: chat.id, chats: [chat] }).chats[0];
    const index = this.state.chats.findIndex(c => c.id === clean.id);
    if (index < 0) this.state.chats.push(clean); else this.state.chats[index] = clean;
    this.state.activeId = clean.id;
    const snapshot = JSON.stringify(this.state);
    const pending = this.queue.then(() => this.write(snapshot));
    this.queue = pending.catch(() => {});
    return pending;
  }
}
