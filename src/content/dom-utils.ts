export function enabled(el: Element): boolean {
  return !el.closest('[aria-disabled="true"], [disabled], [inert]');
}
export function visible(el: Element): boolean {
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}
export function label(el: Element): string {
  const references = el.getAttribute('aria-labelledby')?.split(/\s+/).map(id => el.ownerDocument.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
  const nativeLabel = el instanceof HTMLInputElement ? [...(el.labels || [])].map(item => item.textContent?.trim()).join(' ') : '';
  return (el.getAttribute('aria-label') || references || nativeLabel || el.getAttribute('data-value') || el.textContent || '').trim();
}
export function checked(el: Element): boolean {
  return el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true' || (el instanceof HTMLInputElement && el.checked) || (el instanceof HTMLOptionElement && el.selected);
}
export function setText(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(new DOMException('Đã dừng', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export function hash(text: string): string {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return (value >>> 0).toString(36);
}
