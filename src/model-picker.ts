import { listModels, type Connection, type Provider, type Transport } from './providers';

/** Catalogs are session-only and never mix endpoints or credentials. */
export class ModelCatalog {
  private entries = new Map<Provider, { connection: Connection; models: string[] }>();
  get(provider: Provider, connection: Connection): string[] {
    const entry = this.entries.get(provider);
    return entry && entry.connection.baseUrl === connection.baseUrl && entry.connection.apiKey === connection.apiKey ? entry.models : [];
  }
  async refresh(provider: Provider, connection: Connection, transport: Transport): Promise<string[]> {
    const snapshot = { ...connection };
    const models = [...new Set(await listModels(provider, snapshot, transport, new AbortController().signal))].sort();
    this.entries.set(provider, { connection: snapshot, models });
    return models;
  }
}

export function searchModels(models: string[], query: string): string[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return [...new Set(models)].filter(model => model && words.every(word => model.toLowerCase().includes(word)));
}

let nextModelPicker = 0;

export function renderModelPicker(parent: HTMLElement, provider: Provider, connection: Connection,
  catalog: ModelCatalog, transport: Transport, busy: () => boolean, choose: (model: string) => Promise<void>): void {
  const root = parent.createDiv('mechape-model-picker');
  const label = root.createEl('label', { cls: 'mechape-select' });
  label.createSpan({ text: 'Model' });
  const id = `mechape-model-${++nextModelPicker}`;
  const input = label.createEl('input', { type: 'text', value: connection.model, attr: {
    'aria-label': 'Model', placeholder: 'Search models by name or ID…', role: 'combobox',
    'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': id + '-results', autocomplete: 'off'
  } });
  const refresh = root.createEl('button', { text: 'Refresh models', attr: { 'aria-label': 'Refresh models for selected provider' } });
  const results = root.createDiv({ cls: 'mechape-model-results mechape-project-results', attr: {
    id: id + '-results', role: 'listbox', 'aria-label': 'Matching models'
  } });
  const status = root.createDiv({ cls: 'mechape-model-status', attr: { role: 'status' } });
  let selected = connection.model, matches: string[] = [], active = -1, saving = false;
  const close = () => {
    results.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    input.value = selected; input.title = selected;
  };
  const select = async (model: string) => {
    if (busy() || saving) return;
    close(); saving = true; input.disabled = true;
    try { await choose(model); selected = model; close(); }
    catch { status.setText('Could not save the model. Please try again.'); close(); }
    finally { saving = false; input.disabled = busy(); }
  };
  const show = () => {
    if (busy() || saving) return close();
    const found = searchModels([selected, ...catalog.get(provider, connection)], input.value);
    matches = found.slice(0, 30); active = -1; results.empty();
    input.removeAttribute('aria-activedescendant');
    for (const [index, model] of matches.entries()) {
      const option = results.createDiv({ cls: 'mechape-project-option', text: model, attr: {
        id: `${id}-option-${index}`, role: 'option', 'aria-selected': 'false', title: model
      } });
      option.onmousedown = event => event.preventDefault();
      option.onclick = () => { void select(model); };
    }
    results.hidden = !matches.length; input.setAttribute('aria-expanded', String(!!matches.length));
    status.setText(found.length > 30 ? `${found.length} matches. Showing 30; keep typing to narrow the search.` :
      found.length ? `${found.length} matching models. Choose a result to switch.` :
      'No matching models. Try another search or refresh models.');
  };
  input.onfocus = () => { input.select(); show(); };
  input.oninput = show;
  input.onblur = () => { close(); status.setText(selected ? `Selected: ${selected}` : 'Refresh models to load available choices.'); };
  input.onkeydown = event => {
    if (busy() || saving || event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); status.setText(selected ? `Selected: ${selected}` : 'No model selected.'); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (results.hidden) show();
      if (!matches.length) return;
      active = active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) :
        (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      Array.from(results.children).forEach((el, index) => el.setAttribute('aria-selected', String(index === active)));
      const option = results.children[active] as HTMLElement;
      input.setAttribute('aria-activedescendant', option.id); option.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && !results.hidden) {
      event.preventDefault();
      if (active >= 0) void select(matches[active]);
      else if (matches.length === 1) void select(matches[0]);
    }
  };
  close();
  refresh.onclick = async () => {
    if (busy()) return;
    refresh.disabled = true; status.setText('Loading models…');
    try {
      const models = await catalog.refresh(provider, connection, transport);
      if (!root.isConnected) return;
      if (document.activeElement === input) show();
      status.setText(models.length ? `${models.length} models available` : 'No models returned. Check your provider settings or install an Ollama model.');
    } catch { if (root.isConnected) status.setText('Could not load models. Check the endpoint, API key, and connection in settings, then retry.'); }
    finally { refresh.disabled = busy(); }
  };
}
