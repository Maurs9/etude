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

export function createCompareBadge(firstLabel: string, secondLabel: string) {
  const el = element('div', 'pr-compare-badge');
  el.hidden = true;
  const first = element('span', 'pr-compare-side', firstLabel);
  const arrow = element('span', 'pr-compare-arrow', '→');
  arrow.setAttribute('aria-hidden', 'true');
  const second = element('span', 'pr-compare-side', secondLabel);
  el.append(first, arrow, second);
  const update = (comparing: boolean, activeSecond: boolean) => {
    el.hidden = !comparing;
    if (!comparing) {
      first.removeAttribute('aria-current');
      second.removeAttribute('aria-current');
      return;
    }
    first.setAttribute('aria-current', activeSecond ? 'false' : 'step');
    second.setAttribute('aria-current', activeSecond ? 'step' : 'false');
  };
  return { el, update };
}
