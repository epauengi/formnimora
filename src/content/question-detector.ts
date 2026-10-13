import type { QuestionKind } from '../types';
export const TEXT_SELECTOR = 'textarea, input:not([type]), input[type="text"], input[type="email"], input[type="url"], [role="textbox"]';
export function classifyQuestion(root: Element): QuestionKind {
  if (root.querySelector('input[type="file"], input[type="date"], input[type="time"], input[type="number"]')) return 'unsupported';
  if (root.querySelector('[role="listbox"], select')) return 'dropdown';
  const radios = root.querySelectorAll('[role="radio"], input[type="radio"]');
  const checkboxes = root.querySelectorAll('[role="checkbox"], input[type="checkbox"]');
  const groups = [...root.querySelectorAll('[role="radiogroup"], [role="group"], [role="row"]')]
    .filter(group => group.querySelector('[role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]'));
  const leafGroups = groups.filter(group => !groups.some(other => other !== group && group.contains(other)));
  if (leafGroups.length > 1) return radios.length ? 'radio-grid' : 'checkbox-grid';
  if (radios.length) {
    const numeric = [...radios].every(el => /^\d+$/.test(el.getAttribute('data-value') || el.getAttribute('aria-label') || el.textContent?.trim() || ''));
    return numeric && radios.length >= 2 ? 'scale' : 'radio';
  }
  if (checkboxes.length) return 'checkbox';
  if (root.querySelector('textarea, [role="textbox"][aria-multiline="true"]')) return 'paragraph';
  if (root.querySelector(TEXT_SELECTOR)) return 'text';
  return 'unsupported';
}
