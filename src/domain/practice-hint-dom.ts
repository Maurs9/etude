export function element(kind: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(kind);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function control(id: string, label: string, description: string, disabled: boolean, activate: () => void) {
  const button = document.createElement('button');
  button.className = 'btn sm';
  button.textContent = label;
  button.type = 'button';
  button.dataset.hintControl = id;
  button.disabled = disabled;
  button.setAttribute('aria-label', `${label} — ${description}`);
  button.addEventListener('click', activate);
  return button;
}

export function playControl(
  id: string,
  listenLabel: string,
  stopLabel: string,
  description: string,
  disabled: boolean,
  activate: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'btn sm pr-hint-play';
  button.type = 'button';
  button.dataset.hintControl = id;
  button.disabled = disabled;
  const playTitle = `${listenLabel} — ${description}`;
  const stopTitle = `${stopLabel} — ${description}`;
  button.dataset.labelPlay = playTitle;
  button.dataset.labelStop = stopTitle;
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', playTitle);
  button.title = playTitle;
  button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">'
    + '<path class="pr-ic-play" d="M4.2 2.8v10.4L13.1 8z" fill="currentColor"/>'
    + '<rect class="pr-ic-stop" x="3.5" y="3.5" width="9" height="9" rx="1.4" fill="currentColor"/>'
    + '</svg>';
  button.addEventListener('click', activate);
  return button;
}

export interface SegmentOption<T> {
  readonly value: T;
  readonly id: string;
  readonly label: string;
  readonly ariaLabel: string;
}

export function segmentedControl<T>(
  groupLabel: string,
  options: readonly SegmentOption<T>[],
  initial: T,
  onSelect: (value: T) => void,
): HTMLElement {
  const group = element('div', 'pr-hint-seg');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', groupLabel);
  const buttons: HTMLButtonElement[] = [];
  const sync = (active: T) => {
    options.forEach((opt, i) => buttons[i].setAttribute('aria-pressed', String(opt.value === active)));
  };
  for (const opt of options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pr-hint-seg-btn';
    btn.textContent = opt.label;
    btn.dataset.hintControl = opt.id;
    btn.setAttribute('aria-label', opt.ariaLabel);
    btn.title = opt.ariaLabel;
    btn.addEventListener('click', () => {
      sync(opt.value);
      onSelect(opt.value);
    });
    buttons.push(btn);
    group.append(btn);
  }
  sync(initial);
  return group;
}
