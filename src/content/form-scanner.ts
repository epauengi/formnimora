import type { Choice, Question } from '../types';
import { classifyQuestion, TEXT_SELECTOR } from './question-detector';
import { checked, enabled, hash, label, visible } from './dom-utils';
import { choiceLimits, readItem } from './form-metadata';
export interface DOMQuestion {
  question: Question; root: HTMLElement; text?: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  controls: Map<string, HTMLElement>; rowControls: Map<string, Map<string, HTMLElement>>; dropdown?: HTMLElement;
}
const CHOICE_SELECTOR = '[role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]';
function choices(elements: Element[]): { choices: Choice[]; controls: Map<string, HTMLElement> } {
  const controls = new Map<string, HTMLElement>();
  const result = elements.filter(el => enabled(el) && el.getAttribute('data-value') !== '__other_option__' && !/^(?:other\s*:?|khác\s*:?|mục khác\s*:?)$/i.test(label(el))).map((el, index) => {
    const text = label(el);
    const id = `c${index}-${hash(text)}`;
    controls.set(id, el as HTMLElement);
    return { id, label: text };
  }).filter(choice => choice.label);
  return { choices: result, controls };
}
export function scanForm(doc: Document = document): DOMQuestion[] {
  const roots = [...doc.querySelectorAll<HTMLElement>('[role="listitem"]')].filter(root =>
    visible(root) && root.querySelector('[role="heading"]') && !root.parentElement?.closest('[role="listitem"]') &&
    // Section headings may be wrapped; they have no answer controls to await on resume.
    root.querySelector('[role="heading"]')?.getAttribute('aria-level') !== '2');
  return roots.map((root, index) => {
    const heading = root.querySelector('[role="heading"]');
    const title = (heading?.textContent || '').trim().replace(/\s*\*\s*$/, '');
    const kind = classifyQuestion(root);
    const dropdown = root.querySelector<HTMLElement>('[role="listbox"], select') || undefined;
    const elements = [...root.querySelectorAll(kind === 'dropdown' ? '[role="option"], option' : CHOICE_SELECTOR)];
    const selection = choices(elements.filter(el => kind === 'dropdown' ? !/^choose|^chọn$/i.test(label(el)) : visible(el)));
    const text = root.querySelector<HTMLElement>(TEXT_SELECTOR) || undefined;
    const rows: Question['rows'] = [];
    const rowControls = new Map<string, Map<string, HTMLElement>>();
    if (kind.endsWith('grid')) {
      const groups = [...root.querySelectorAll<HTMLElement>('[role="radiogroup"], [role="group"], [role="row"]')].filter(group => group.querySelector(CHOICE_SELECTOR));
      const leafGroups = groups.filter(group => !groups.some(other => other !== group && group.contains(other)));
      leafGroups.forEach((group, rowIndex) => {
        const rowLabel = group.getAttribute('aria-label') || label(group.querySelector('[role="rowheader"]') || group).slice(0, 150) || `Hàng ${rowIndex + 1}`;
        const id = `r${rowIndex}-${hash(rowLabel)}`;
        const row = choices([...group.querySelectorAll(CHOICE_SELECTOR)].filter(visible));
        rows.push({ id, label: rowLabel, choices: row.choices }); rowControls.set(id, row.controls);
      });
    }
    const isAnswered = (items: HTMLElement[]) => items.some(checked);
    const textValue = text instanceof HTMLInputElement || text instanceof HTMLTextAreaElement ? text.value : text?.textContent;
    const answered = kind.endsWith('grid') ? rows.length > 0 && rows.every(row => isAnswered([...rowControls.get(row.id)!.values()]))
      : kind === 'text' || kind === 'paragraph' ? !!textValue?.trim()
      : kind === 'dropdown' ? (dropdown instanceof HTMLSelectElement ? !!dropdown.value : isAnswered([...selection.controls.values()]))
      : isAnswered([...selection.controls.values()]);
    const item = readItem(root);
    const question: Question = {
      id: item && Number.isSafeInteger(item[0]) ? `item-${item[0]}` : `q${index}-${hash(title + kind)}`, title, kind, choices: kind.endsWith('grid') ? [] : selection.choices,
      rows, answered, required: !!root.querySelector('[aria-required="true"], [required]') || /\*\s*$/.test(heading?.textContent || ''),
      ...(item ? choiceLimits(item) : {}),
    };
    return { question, root, text, controls: selection.controls, rowControls, dropdown };
  });
}
export function pageSignature(doc: Document = document): string {
  return hash(scanForm(doc).map(item => item.question.id).join('|'));
}
