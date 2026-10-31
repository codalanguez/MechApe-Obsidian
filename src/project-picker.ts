import { Modal, Notice, TFolder, type App } from 'obsidian';
import { allowedProject, currentProject, newProjectPath, searchProjects } from './projects';

let nextPicker = 0;

export function renderProjectPicker(container: HTMLElement, app: App, selected: string, excluded: string,
  busy: () => boolean, choose: (path: string) => Promise<void>): void {
  const root = container.createDiv('mechape-project-picker');
  const id = `mechape-project-${++nextPicker}`;
  root.createEl('label', { text: 'Project', attr: { for: id } });
  const input = root.createEl('input', { type: 'text', value: selected, attr: {
    id, placeholder: 'Search projects by name or path…', role: 'combobox', 'aria-autocomplete': 'list',
    'aria-expanded': 'false', 'aria-controls': id + '-results', autocomplete: 'off'
  } });
  const results = root.createDiv({ cls: 'mechape-project-results', attr: { id: id + '-results', role: 'listbox', 'aria-label': 'Matching projects' } });
  const hint = root.createDiv({ cls: 'mechape-project-hint', attr: { role: 'status', 'aria-live': 'polite' } });
  const actions = root.createDiv('mechape-project-actions');
  const current = actions.createEl('button', { text: 'Use current project', attr: { type: 'button', title: 'Use the active note’s project folder' } });
  const create = actions.createEl('button', { text: 'Create new project', attr: { type: 'button' } });
  let matches: string[] = [], active = -1, query = selected;
  const close = () => {
    results.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    hint.setText('Selected: ' + (selected || 'Whole vault'));
  };
  const select = (path: string) => {
    if (busy()) return;
    close(); void choose(path).catch((error: unknown) => new Notice(error instanceof Error ? error.message : 'Could not select project.'));
  };
  const highlight = () => {
    Array.from(results.children).forEach((el, index) => el.setAttribute('aria-selected', String(index === active)));
    const option = results.children[active] as HTMLElement | undefined;
    if (option) { input.setAttribute('aria-activedescendant', option.id); option.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  const show = () => {
    if (busy()) return close();
    const paths = app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder).map(f => f.path);
    const found = searchProjects(paths, input.value, excluded);
    matches = found.slice(0, 30);
    if (!input.value.trim() || 'whole vault'.includes(input.value.trim().toLowerCase())) matches.unshift('');
    results.empty(); active = -1;
    for (const [index, path] of matches.entries()) {
      const option = results.createDiv({ cls: 'mechape-project-option', text: path || 'Whole vault', attr: {
        id: `${id}-option-${index}`, role: 'option', 'aria-selected': 'false', title: path || 'Whole vault'
      } });
      option.onmousedown = event => event.preventDefault();
      option.onclick = () => select(path);
    }
    results.hidden = matches.length === 0; input.setAttribute('aria-expanded', String(matches.length > 0));
    input.removeAttribute('aria-activedescendant');
    hint.setText(matches.length ? (found.length > 30 ? 'Showing 30 matches. Keep typing to narrow the search.' : 'Choose a result to switch projects.') : 'No matching folders. You can create a new project below.');
  };
  input.onfocus = () => { input.select(); show(); };
  input.oninput = () => { query = input.value; show(); };
  input.onkeydown = event => {
    if (busy()) return;
    if (event.key === 'Escape') { event.preventDefault(); input.value = selected; close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (results.hidden) show();
      if (matches.length) { active = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; highlight(); }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!results.hidden && active >= 0) select(matches[active]);
      else if (matches.includes(input.value.trim())) select(input.value.trim());
      else if (matches.length === 1) select(matches[0]);
    }
  };
  input.onblur = () => { input.value = selected; close(); };
  current.onclick = () => {
    if (busy()) return;
    const path = currentProject(app.workspace.getActiveFile()?.path, selected);
    if (path === undefined) { new Notice('Open a note first to use its project folder.'); return; }
    if (!allowedProject(path, excluded)) { new Notice('The active note is in a hidden or excluded folder.'); return; }
    select(path);
  };
  create.onclick = () => { if (!busy()) new CreateProjectModal(app, query, excluded, busy, choose).open(); };
  close();
}

class CreateProjectModal extends Modal {
  constructor(app: App, private initial: string, private excluded: string, private busy: () => boolean,
    private choose: (path: string) => Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.setText('Create new project');
    this.contentEl.createEl('p', { text: 'Create an empty vault folder and select it for chat. Use a name or a path such as projects/my project. Existing notes are not changed.' });
    const form = this.contentEl.createEl('form');
    const input = form.createEl('input', { type: 'text', value: this.initial, cls: 'mechape-project-name', attr: { 'aria-label': 'New project folder', placeholder: 'Projects/my project' } });
    const error = form.createDiv({ attr: { role: 'alert' } });
    const actions = form.createDiv('mechape-project-actions');
    const cancel = actions.createEl('button', { text: 'Cancel', type: 'button' }); cancel.onclick = () => this.close();
    const create = actions.createEl('button', { text: 'Create project', type: 'submit', cls: 'mod-cta' });
    form.onsubmit = async event => {
      event.preventDefault(); if (create.disabled) return;
      if (this.busy()) { error.setText('Finish or stop the current reply before creating a project.'); return; }
      create.disabled = true;
      try {
        const path = newProjectPath(input.value, this.excluded);
        if (this.app.vault.getAbstractFileByPath(path)) throw new Error('That folder or file already exists. Choose it in project search or use a new name.');
        await this.app.vault.createFolder(path);
        await this.choose(path); this.close(); new Notice('Project created: ' + path);
      } catch (e) { error.setText(e instanceof Error ? e.message : 'Could not create project.'); }
      finally { create.disabled = false; }
    };
    input.focus(); input.select();
  }
  onClose(): void { this.contentEl.empty(); }
}
