import type { Skill } from './config';

export function skillQuery(text: string, caret: number): string | null {
  const prefix = text.slice(0, caret);
  const match = /^\s*\/([^/\n]*)$/.exec(prefix);
  return match ? match[1] : null;
}
export function searchSkills(skills: Skill[], query: string): Skill[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return skills.filter(skill => words.every(word => `${skill.id} ${skill.name}`.toLowerCase().includes(word)));
}
let nextSkillPicker = 0;

export function renderSkillPicker(parent: HTMLElement, input: HTMLTextAreaElement,
  skills: () => Skill[], selected: () => string, busy: () => boolean,
  choose: (id: string) => Promise<void>) {
  const id = `mechape-skills-${++nextSkillPicker}`;
  const root = parent.createDiv('mechape-chat-skills');
  const button = root.createEl('button', { cls: 'mechape-skill-chip', attr: {
    type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': id
  } });
  const menu = root.createDiv({ cls: 'mechape-skill-menu', attr: { id, role: 'listbox', 'aria-label': 'Skills' } });
  const status = root.createDiv({ cls: 'mechape-skill-status', attr: { role: 'status' } });
  let matches: Skill[] = [], active = 0, saving = false, fromSlash = false;
  input.setAttribute('aria-controls', id);
  const close = () => {
    menu.hidden = true; button.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    status.setText('');
  };
  const update = () => {
    const skill = skills().find(s => s.id === selected());
    button.setText(`/ ${skill?.name ?? 'Choose skill'}`);
    button.title = `Change skill (or type / in your message). ${skill?.canWrite ? 'Note writes require approval.' : 'Read-only skill.'} Switching skills starts fresh model context and keeps your transcript.`; button.disabled = busy() || saving;
  };
  const activate = async (skill: Skill) => {
    if (busy() || saving) return;
    const draft = input.value, caret = input.selectionStart;
    const removeCommand = fromSlash && skillQuery(draft, caret) !== null;
    saving = true; close(); update(); input.readOnly = true;
    try {
      await choose(skill.id);
      if (removeCommand && input.value === draft) {
        input.value = draft.slice(caret).replace(/^ +/, ''); input.setSelectionRange(0, 0);
      }
      status.setText('');
    } catch { status.setText('Could not change skill. Please try again.'); }
    finally { saving = false; input.readOnly = false; update(); input.focus(); }
  };
  const highlight = () => {
    Array.from(menu.children).forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    const option = menu.children[active] as HTMLElement | undefined;
    if (option) { input.setAttribute('aria-activedescendant', option.id); option.scrollIntoView({ block: 'nearest' }); }
  };
  const show = (query: string, slash: boolean) => {
    if (busy() || saving) return close();
    fromSlash = slash; matches = searchSkills(skills(), query); active = 0; menu.empty();
    for (const [index, skill] of matches.entries()) {
      const option = menu.createDiv({ cls: 'mechape-project-option', attr: { id: `${id}-${index}`, role: 'option', 'aria-selected': String(index === active) } });
      option.createDiv({ text: skill.name });
      option.createDiv({ cls: 'mechape-muted', text: `/${skill.id} · ${skill.canWrite ? 'Reviewed writes' : 'Read-only'}` });
      option.onmousedown = event => event.preventDefault();
      option.onclick = () => { void activate(skill); };
    }
    menu.hidden = false; button.setAttribute('aria-expanded', 'true');
    menu.title = 'Use arrow keys to navigate, Enter to activate, or Escape to close.';
    status.setText(matches.length ? '' : 'No matching skills. Try another name or press Esc.');
    input.removeAttribute('aria-activedescendant'); highlight();
  };
  button.onclick = () => { if (!menu.hidden) close(); else { input.focus(); show('', false); } };
  input.addEventListener('input', () => {
    const query = skillQuery(input.value, input.selectionStart);
    if (query === null) close(); else show(query, true);
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.shiftKey) return;
    if (saving && event.key === 'Enter') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (menu.hidden) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
      if (event.key !== 'Tab') event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape' || event.key === 'Tab') { close(); return; }
      if (event.key === 'Enter') { if (matches[active]) void activate(matches[active]); return; }
      if (matches.length) { active = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; highlight(); }
    }
  }, true);
  input.addEventListener('blur', close);
  close(); update();
  return { update, blocksSubmission: () => saving || !menu.hidden };
}
