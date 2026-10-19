import type { Choice, Question } from '../types';
import { hash } from './dom-utils';

// ponytail: Forms' public JSON is undocumented; malformed/changed metadata falls back to the visible DOM.
export function formItems(doc: Document = document): unknown[][] {
  const source = [...doc.scripts].map(script => script.textContent || '').find(text => /^\s*var FB_PUBLIC_LOAD_DATA_\s*=/.test(text));
  if (!source || source.length > 2_000_000) return [];
  try {
    const data = JSON.parse(source.replace(/^\s*var FB_PUBLIC_LOAD_DATA_\s*=\s*/, '').replace(/;\s*$/, ''));
    return Array.isArray(data?.[1]?.[1]) ? data[1][1].filter(Array.isArray) : [];
  } catch { return []; }
}

export function choiceLimits(item: unknown[]): Pick<Question, 'minChoices' | 'maxChoices'> {
  const entries = item[4];
  const rules = Array.isArray(entries) && Array.isArray(entries[0]) ? entries[0][4] : undefined;
  const limits: Pick<Question, 'minChoices' | 'maxChoices'> = {};
  if (Array.isArray(rules)) for (const rule of rules) {
    if (!Array.isArray(rule) || rule[0] !== 7) continue;
    const count = Number(rule[2]?.[0]);
    if (!Number.isInteger(count) || count < 1 || count > 100) continue;
    if (rule[1] === 200 || rule[1] === 202) limits.minChoices = count;
    if (rule[1] === 201 || rule[1] === 202) limits.maxChoices = count;
  }
  return limits;
}

export function readItem(root: Element): unknown[] | undefined {
  const raw = root.getAttribute('data-params') || root.querySelector('[data-params]')?.getAttribute('data-params');
  if (!raw?.startsWith('%.@.') || raw.length > 100_000) return;
  try {
    const item = JSON.parse('[' + raw.slice(4))[0];
    return Array.isArray(item) ? item : undefined;
  } catch { return; }
}

export function formPage(doc: Document = document, fallback = 1): number {
  const first = Number(doc.querySelector('form[data-first-entry]')?.getAttribute('data-first-entry') ?? NaN);
  const items = formItems(doc);
  if (!Number.isInteger(first) || first < 0 || first >= items.length) return fallback;
  return 1 + items.slice(0, first + 1).filter(item => item[3] === 8).length;
}

export function allFormQuestions(doc: Document = document): { page: number; title: string; questions: Question[] }[] {
  const items = formItems(doc);
  if (!items.length) return [];
  const pages = [{ page: 1, title: 'Trang 1', questions: [] as Question[] }];
  for (const item of items) {
    if (item[3] === 8) {
      pages.push({ page: pages.length + 1, title: String(item[1] || `Trang ${pages.length + 1}`), questions: [] });
      continue;
    }
    if (![0, 1, 2, 3, 4, 5].includes(Number(item[3])) || !Number.isSafeInteger(item[0]) || typeof item[1] !== 'string') continue;
    const entries = item[4];
    const entry = Array.isArray(entries) && Array.isArray(entries[0]) ? entries[0] : [];
    const options: unknown[] = Array.isArray(entry[1]) ? entry[1] : [];
    const choices: Choice[] = options.filter((option): option is unknown[] => Array.isArray(option) && !option[4] && typeof option[0] === 'string' && !!option[0].trim() && !/^(?:other|khác|mục khác)\s*:?$/i.test(option[0].trim())).map((option, index) => ({ id: `c${index}-${hash(String(option[0]).trim())}`, label: String(option[0]).trim() }));
    const kind = ({ 0: 'text', 1: 'paragraph', 2: 'radio', 3: 'dropdown', 4: 'checkbox', 5: 'scale' } as const)[item[3] as 0 | 1 | 2 | 3 | 4 | 5];
    pages.at(-1)!.questions.push({ id: `item-${item[0]}`, title: item[1].replace(/<[^>]*>/g, ''), kind, choices, rows: [], answered: false, required: !!entry[2], ...choiceLimits(item) });
  }
  return pages;
}
