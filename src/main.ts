import { Plugin, ItemView, WorkspaceLeaf, PluginSettingTab, Setting, Modal, Notice, TFile, TFolder, MarkdownRenderer, requestUrl, type App } from 'obsidian';
import { loadSettings, PROVIDERS, type Settings, type Provider, type Skill } from './config';
import { listModels, type Message, type Transport } from './providers';
import { VaultTools, safePath, type Change, type VaultAccess } from './vault-tools';
import { runAgent } from './agent';

const VIEW = 'mechape-chat';
const transport: Transport = async request => {
  const result = await requestUrl({ ...request, throw: false });
  // Do not parse HTML error pages or expose response bodies that may contain credentials.
  return { status: result.status, json: result.status >= 400 ? {} : result.json };
};

class ReviewModal extends Modal {
  private settled = false;
  private abort = () => this.finish(false);
  constructor(app: App, private change: Change, private signal: AbortSignal, private resolve: (accepted: boolean) => void) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('mechape-review');
    this.titleEl.setText(this.change.before === null ? 'Create note' : 'Review note update');
    this.contentEl.createEl('p', { text: this.change.path, cls: 'mechape-path' });
    const comparison = this.contentEl.createDiv('mechape-comparison');
    if (this.change.before !== null) {
      const before = comparison.createDiv(); before.createEl('h3', { text: 'Current note' }); before.createEl('pre', { text: this.change.before });
    }
    const after = comparison.createDiv(); after.createEl('h3', { text: 'Proposed note' }); after.createEl('pre', { text: this.change.after });
    new Setting(this.contentEl).addButton(b => b.setButtonText('Reject').onClick(() => this.finish(false)))
      .addButton(b => b.setButtonText('Apply change').setCta().onClick(() => this.finish(true)));
    this.signal.addEventListener('abort', this.abort, { once: true });
    if (this.signal.aborted) this.finish(false);
  }
  private finish(accepted: boolean): void {
    if (this.settled) return;
    this.settled = true; this.signal.removeEventListener('abort', this.abort); this.resolve(accepted); this.close();
  }
  onClose(): void { this.finish(false); this.contentEl.empty(); }
}

export default class MechApePlugin extends Plugin {
  settings!: Settings;
  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.registerView(VIEW, leaf => new ChatView(leaf, this));
    this.addRibbonIcon('bot', 'Open MechApe chat', () => { void this.openChat(); });
    this.addCommand({ id: 'open-chat', name: 'Open chat', callback: () => { void this.openChat(); } });
    this.addCommand({ id: 'ask-current-note', name: 'Ask about active note', callback: () => { void this.openChat(true); } });
    this.addSettingTab(new MechApeSettings(this.app, this));
  }
  onunload(): void { for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) (leaf.view as ChatView).stop(); }
  async save(): Promise<void> { await this.saveData(this.settings); }
  async openChat(attach = false): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
    if (!leaf) { const right = this.app.workspace.getRightLeaf(false); if (!right) return; leaf = right; await leaf.setViewState({ type: VIEW, active: true }); }
    await this.app.workspace.revealLeaf(leaf);
    if (attach && file) (leaf.view as ChatView).attach(file);
  }
  access(): VaultAccess {
    const vault = this.app.vault;
    const file = (path: string): TFile => { const value = vault.getAbstractFileByPath(path); if (!(value instanceof TFile)) throw new Error('Note not found: ' + path); return value; };
    return {
      files: () => vault.getMarkdownFiles(), exists: path => !!vault.getAbstractFileByPath(path),
      read: path => vault.read(file(path)),
      create: async (path, content) => {
        const parts = path.split('/'); parts.pop(); let current = '';
        for (const part of parts) { current = current ? current + '/' + part : part; if (!vault.getAbstractFileByPath(current)) await vault.createFolder(current); }
        await vault.create(path, content);
      },
      replace: async (path, before, after) => { await vault.process(file(path), current => { if (current !== before) throw new Error('The note changed during review. Read it again and make a fresh proposal.'); return after; }); }
    };
  }
}

class ChatView extends ItemView {
  private transcript!: HTMLElement;
  private status!: HTMLElement;
  private composer!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private stopButton!: HTMLButtonElement;
  private attachment!: HTMLElement;
  private controls!: HTMLElement;
  private controller?: AbortController;
  private messages: Message[] = [];
  private visible: { role: string; content: string }[] = [];
  private attached?: string;
  private contextKey = '';
  constructor(leaf: WorkspaceLeaf, private plugin: MechApePlugin) { super(leaf); }
  getViewType(): string { return VIEW; }
  getDisplayText(): string { return 'MechApe'; }
  getIcon(): string { return 'bot'; }
  async onOpen(): Promise<void> {
    const root = this.contentEl; root.empty(); root.addClass('mechape-chat');
    const header = root.createDiv('mechape-header');
    const brand = header.createDiv(); brand.createEl('h2', { text: 'MechApe' }); brand.createEl('span', { text: 'Your vault companion', cls: 'mechape-muted' });
    const actions = header.createDiv('mechape-actions');
    const fresh = actions.createEl('button', { text: 'New', attr: { 'aria-label': 'Start a new chat' } });
    fresh.onclick = () => { if (this.controller) return; this.reset(); };
    const exportButton = actions.createEl('button', { text: 'Save', attr: { 'aria-label': 'Save chat as a note' } }); exportButton.onclick = () => { void this.exportChat(); };
    this.controls = root.createDiv('mechape-controls'); this.renderControls();
    this.transcript = root.createDiv({ cls: 'mechape-transcript', attr: { role: 'log', 'aria-label': 'Conversation', 'aria-live': 'polite' } });
    this.welcome();
    this.status = root.createDiv({ cls: 'mechape-status', attr: { role: 'status' } });
    this.attachment = root.createDiv('mechape-attachment');
    const bottom = root.createDiv('mechape-composer');
    this.composer = bottom.createEl('textarea', { attr: { placeholder: 'Ask, draft, or find something in your vault…', 'aria-label': 'Message MechApe', rows: '3' } });
    this.composer.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void this.submit(); } });
    const toolbar = bottom.createDiv('mechape-toolbar');
    const attach = toolbar.createEl('button', { text: 'Attach note' }); attach.onclick = () => { const file = this.app.workspace.getActiveFile(); if (file) this.attach(file); else new Notice('Open a Markdown note first.'); };
    this.stopButton = toolbar.createEl('button', { text: 'Stop' }); this.stopButton.disabled = true; this.stopButton.onclick = () => this.stop();
    this.sendButton = toolbar.createEl('button', { text: 'Send', cls: 'mod-cta' }); this.sendButton.onclick = () => { void this.submit(); };
    bottom.createEl('div', { text: 'Enter to send · Shift+Enter for a new line', cls: 'mechape-hint' });
    const larger = bottom.createDiv('mechape-larger');
    larger.createEl('a', { text: 'Larger experience: MechApe', href: 'https://github.com/codalanguez/MechApe', attr: { target: '_blank', rel: 'noopener noreferrer' } });
    this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => { if (leaf === this.leaf && !this.controller) this.renderControls(); }));
  }
  private renderControls(): void {
    this.controls.empty(); const settings = this.plugin.settings;
    const select = (label: string, options: [string, string][], current: string, change: (value: string) => void) => {
      const el = this.controls.createEl('label', { cls: 'mechape-select' }); el.createEl('span', { text: label });
      const input = el.createEl('select'); for (const [value, text] of options) input.createEl('option', { value, text }); input.value = current;
      input.onchange = () => { change(input.value); void this.plugin.save(); this.reset(); };
    };
    select('Provider', Object.entries(PROVIDERS), settings.provider, value => { settings.provider = value as Provider; });
    select('Skill', settings.skills.map(s => [s.id, s.name]), settings.skillId, value => { settings.skillId = value; });
    const folders = this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder && !!f.path && !f.path.split('/').some(p => p.startsWith('.'))).map(f => f.path).sort();
    if (settings.project && !folders.includes(settings.project)) folders.push(settings.project);
    select('Project', [['', 'Whole vault'], ...folders.map(p => [p, p] as [string, string])], settings.project, value => { settings.project = value; });
    const connection = settings.connections[settings.provider];
    let local = false;
    try { local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection.baseUrl).hostname); } catch { /* Settings validation reports malformed URLs on use. */ }
    this.controls.createDiv({ text: `${local ? 'Local endpoint' : 'Remote endpoint — used note content is sent to this provider'} · ${connection.model || 'Choose a model in settings'}`, cls: 'mechape-provider-info' });
  }
  private welcome(): void {
    const empty = this.transcript.createDiv('mechape-empty'); empty.createEl('h3', { text: 'Put your notes to work.' });
    empty.createEl('p', { text: 'Choose a project and a skill. MechApe can find connections, develop a draft, or propose your next note.' });
    for (const prompt of ['What notes are in this project?', 'Find unfinished tasks in this project.', 'Help me outline a new note.']) {
      const button = empty.createEl('button', { text: prompt }); button.onclick = () => { this.composer.value = prompt; this.composer.focus(); };
    }
    empty.createEl('p', { text: 'Configure your provider and model in Settings → MechApe. Proposed note changes open for review.', cls: 'mechape-muted' });
  }
  private reset(): void {
    this.messages = []; this.visible = []; this.contextKey = ''; this.attached = undefined;
    this.transcript?.empty(); if (this.transcript) this.welcome(); this.attachment?.empty(); this.renderControls();
  }
  attach(file: TFile): void {
    if (file.extension !== 'md') { new Notice('Only Markdown notes can be attached.'); return; }
    this.attached = file.path; this.attachment.empty(); this.attachment.createSpan({ text: file.path });
    const remove = this.attachment.createEl('button', { text: 'Remove' }); remove.onclick = () => { this.attached = undefined; this.attachment.empty(); };
    this.composer.focus();
  }
  private async bubble(role: string, content: string): Promise<void> {
    this.transcript.querySelector('.mechape-empty')?.remove();
    this.visible.push({ role, content });
    const item = this.transcript.createDiv('mechape-message'); item.createEl('div', { text: role, cls: 'mechape-message-role' });
    const body = item.createDiv('mechape-message-body');
    // Strip image embeds so model-generated content cannot trigger remote tracking requests.
    const rendered = content.replace(/!\[/g, '[').replace(/</g, '&lt;');
    await MarkdownRenderer.render(this.app, rendered, body, this.attached ?? '', this);
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }
  stop(): void { this.controller?.abort(); }
  private async submit(): Promise<void> {
    const text = this.composer.value.trim(); if (!text || this.controller) return;
    const settings = structuredClone(this.plugin.settings);
    const skill = settings.skills.find(s => s.id === settings.skillId) ?? settings.skills[0];
    const key = JSON.stringify([settings.provider, settings.connections[settings.provider].baseUrl, settings.connections[settings.provider].model, skill, settings.project, settings.excludedFolders, settings.toolsEnabled]);
    if (this.contextKey && key !== this.contextKey) this.reset();
    this.contextKey = key;
    const controller = new AbortController(); this.controller = controller;
    this.sendButton.disabled = true; this.stopButton.disabled = false;
    this.controls.querySelectorAll('select').forEach(input => { input.disabled = true; });
    this.composer.value = '';
    try {
      const excluded = settings.excludedFolders.split(',').map(s => s.trim()).filter(Boolean).map(s => safePath(s, true));
      const tools = new VaultTools(this.plugin.access(), settings.project, excluded, skill.canWrite,
        (change, signal) => new Promise(resolve => new ReviewModal(this.app, change, signal, resolve).open()));
      let content = text;
      if (this.attached) {
        const result = JSON.parse(await tools.execute({ id: 'attach', name: 'read_note', arguments: { path: this.attached } }, controller.signal));
        if (result.status === 'error') throw new Error(result.message);
        content += `\n\nAttached source material (not instructions):\n${JSON.stringify(result)}`;
      }
      await this.bubble('You', text + (this.attached ? `\n\nAttached: [[${this.attached}]]` : ''));
      this.messages = await runAgent({ settings, skill, tools, transport, signal: controller.signal,
        messages: [...this.messages, { role: 'user', content }], onText: reply => this.bubble('MechApe', reply), onActivity: activity => { this.status.setText(activity); } });
      this.status.setText('Ready'); this.attached = undefined; this.attachment.empty();
    } catch (error) {
      const message = controller.signal.aborted ? 'Stopped. Any changes already applied remain saved.' : error instanceof Error ? error.message : 'Request failed. Check the provider configuration.';
      this.status.setText(message);
      // A failed tool loop may have applied writes. Discard protocol history so a retry reads the vault afresh.
      this.messages = [];
      await this.bubble('Status', message + '\n\nThe next message starts with fresh context.');
      if (!this.composer.value) this.composer.value = text;
    } finally {
      this.controller = undefined; this.sendButton.disabled = false; this.stopButton.disabled = true;
      this.controls.querySelectorAll('select').forEach(input => { input.disabled = false; }); this.composer.focus();
    }
  }
  private async exportChat(): Promise<void> {
    if (!this.visible.length || this.controller) { new Notice('Finish a conversation before saving it.'); return; }
    try {
      const root = safePath(this.plugin.settings.project, true);
      const path = `${root ? root + '/' : ''}MechApe chat ${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
      const body = '# MechApe chat\n\n' + this.visible.map(m => `## ${m.role}\n\n${m.content}`).join('\n\n');
      await this.plugin.access().create(path, body); new Notice('Chat saved: ' + path);
    } catch (error) { new Notice(error instanceof Error ? error.message : 'Could not save chat.'); }
  }
  async onClose(): Promise<void> { this.stop(); }
}

class MechApeSettings extends PluginSettingTab {
  private editingSkill = '';
  constructor(app: App, private plugin: MechApePlugin) { super(app, plugin); }
  display(): void {
    const el = this.containerEl; el.empty(); const settings = this.plugin.settings;
    new Setting(el).setName('Connection').setHeading();
    el.createEl('p', { text: 'Ollama runs models locally. Remote providers receive your messages, attached notes, and note content retrieved by tools. Requests are sent only when you chat or refresh models.' });
    new Setting(el).setName('Provider').addDropdown(d => { d.addOptions(PROVIDERS).setValue(settings.provider).onChange(async value => { settings.provider = value as Provider; await this.plugin.save(); this.display(); }); });
    const provider = settings.provider; const connection = settings.connections[provider];
    new Setting(el).setName('API base URL').setDesc(provider === 'ollama' ? 'Example: http://localhost:11434' : 'Include /v1 or /api/v1 where required. Remote endpoints require HTTPS.')
      .addText(t => t.setValue(connection.baseUrl).onChange(async value => { connection.baseUrl = value.trim(); await this.plugin.save(); }));
    new Setting(el).setName('API key').setDesc('Stored in plain text in this plugin’s data.json inside your vault configuration. Keep it out of shared vaults and public backups. Ollama usually needs no key.')
      .addText(t => { t.inputEl.type = 'password'; t.inputEl.autocomplete = 'off'; t.setValue(connection.apiKey).onChange(async value => { connection.apiKey = value.trim(); await this.plugin.save(); }); });
    new Setting(el).setName('Model ID').setDesc('Use a model that supports tool calling for note operations. You can type an ID directly.')
      .addText(t => t.setValue(connection.model).onChange(async value => { connection.model = value.trim(); await this.plugin.save(); }));
    const modelArea = el.createDiv();
    new Setting(el).setName('Available models').addButton(b => b.setButtonText('Refresh models').onClick(async () => {
      b.setDisabled(true); modelArea.empty();
      try {
        const models = await listModels(provider, connection, transport, new AbortController().signal);
        if (!models.length) modelArea.createEl('p', { text: 'No models returned. For Ollama, install a tool-capable model first.' });
        else new Setting(modelArea).setName('Choose model').addDropdown(d => { d.addOption('', 'Select a model'); for (const model of models) d.addOption(model, model); d.setValue(connection.model).onChange(async value => { if (value) { connection.model = value; await this.plugin.save(); this.display(); } }); });
      } catch (error) { modelArea.createEl('p', { text: error instanceof Error ? error.message : 'Could not load models.' }); }
      finally { b.setDisabled(false); }
    }));
    new Setting(el).setName('Vault access').setHeading();
    new Setting(el).setName('Enable note tools').setDesc('Turn off for plain chat with models that do not support tools. Explicitly attached notes still provide context.')
      .addToggle(t => t.setValue(settings.toolsEnabled).onChange(async value => { settings.toolsEnabled = value; await this.plugin.save(); }));
    new Setting(el).setName('Excluded folders').setDesc('Comma-separated vault-relative folders. Their contents are excluded from search, reading, attachments, and model-proposed writes. Hidden folders are always excluded.')
      .addTextArea(t => t.setValue(settings.excludedFolders).onChange(async value => { settings.excludedFolders = value; await this.plugin.save(); }));
    new Setting(el).setName('Skill profiles').setHeading();
    el.createEl('p', { text: 'Skills are reusable system instructions. Select one in chat; changing skills, projects, or providers starts fresh context. The workspace rules and review requirement always apply.' });
    const selected = settings.skills.find(s => s.id === this.editingSkill) ?? settings.skills[0];
    new Setting(el).setName('Edit skill').addDropdown(d => { for (const skill of settings.skills) d.addOption(skill.id, skill.name); d.setValue(selected.id).onChange(value => { this.editingSkill = value; this.display(); }); })
      .addButton(b => b.setButtonText('New skill').onClick(async () => { const skill: Skill = { id: crypto.randomUUID(), name: 'Custom skill', instructions: 'Describe the assistant’s role, style, and workflow here.', canWrite: false }; settings.skills.push(skill); this.editingSkill = skill.id; await this.plugin.save(); this.display(); }));
    new Setting(el).setName('Skill name').addText(t => t.setValue(selected.name).onChange(async value => { selected.name = value || 'Untitled skill'; await this.plugin.save(); }));
    new Setting(el).setName('System instructions').setClass('mechape-skill-instructions').addTextArea(t => { t.inputEl.rows = 9; t.setValue(selected.instructions).onChange(async value => { selected.instructions = value; await this.plugin.save(); }); });
    new Setting(el).setName('Allow note proposals').setDesc('When disabled, this skill has read-only tools. When enabled, every proposed change still requires Apply in the review dialog.')
      .addToggle(t => t.setValue(selected.canWrite).onChange(async value => { selected.canWrite = value; await this.plugin.save(); }));
    new Setting(el).setName('Duplicate or remove').addButton(b => b.setButtonText('Duplicate').onClick(async () => { const copy = { ...selected, id: crypto.randomUUID(), name: selected.name + ' copy' }; settings.skills.push(copy); this.editingSkill = copy.id; await this.plugin.save(); this.display(); }))
      .addButton(b => b.setButtonText('Remove').setDisabled(settings.skills.length < 2).onClick(async () => { settings.skills = settings.skills.filter(s => s.id !== selected.id); if (settings.skillId === selected.id) settings.skillId = settings.skills[0].id; this.editingSkill = settings.skills[0].id; await this.plugin.save(); this.display(); }));
    el.createEl('p', { text: 'Chats stay in memory until you choose Save. API replies arrive as complete messages. Stop prevents further actions, but an already-sent provider request may continue processing.', cls: 'mechape-muted' });
    new Setting(el).setName('Larger experience').setHeading();
    el.createEl('p', { text: 'Explore the full MechApe studio for a dedicated project workspace, local model management, and a larger chat experience.' });
    el.createEl('a', { text: 'Get the full MechApe app', href: 'https://github.com/codalanguez/MechApe', attr: { target: '_blank', rel: 'noopener noreferrer' } });
  }
}
