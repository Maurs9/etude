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
