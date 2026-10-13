import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { classifyQuestion } from '../src/content/question-detector';
import { scanForm } from '../src/content/form-scanner';
import { choose, planAnswer, validateAnswer, validateFillSettings } from '../src/content/answer-planner';
import { DEFAULT_FILL } from '../src/types';
function fixture(content: string) {
  const dom = new JSDOM(`<div role="list"><div role="listitem"><div role="heading">Câu hỏi *</div>${content}</div></div>`);
  for (const key of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLOptionElement', 'Event'] as const) Object.assign(globalThis, { [key]: dom.window[key] });
  Object.assign(globalThis, { document: dom.window.document, getComputedStyle: dom.window.getComputedStyle.bind(dom.window) });
  return dom.window.document;
}
const radio = (label: string, extra = '') => `<div role="radio" aria-label="${label}" aria-checked="false" ${extra}></div>`;
const checkbox = (label: string) => `<div role="checkbox" aria-label="${label}" aria-checked="false"></div>`;
test('classifies six choice kinds and two text kinds without dynamic classes', () => {
  const cases = [
    [radio('Nam') + radio('Nữ'), 'radio'],
    [checkbox('A') + checkbox('B'), 'checkbox'],
    ['<div role="listbox"><div role="option" data-value="A">A</div></div>', 'dropdown'],
    [radio('1') + radio('2') + radio('3'), 'scale'],
    [`<div role="radiogroup">${radio('A')}</div><div role="radiogroup">${radio('B')}</div>`, 'radio-grid'],
    [`<div role="group">${checkbox('A')}</div><div role="group">${checkbox('B')}</div>`, 'checkbox-grid'],
    ['<input type="text">', 'text'], ['<textarea></textarea>', 'paragraph'],
    ['<input type="file">', 'unsupported'], ['<input type="date">', 'unsupported'],
  ];
  for (const [html, expected] of cases) assert.equal(classifyQuestion(fixture(html).querySelector('[role="listitem"]')!), expected);
});
test('scanner supports question containers with inner listitem wrappers and excludes nested sub-questions', () => {
  const doc = fixture('<div role="listitem"><div role="checkbox" aria-label="A" aria-checked="false"></div></div><div role="listitem"><div role="checkbox" aria-label="B" aria-checked="false"></div></div>');
  const questions = scanForm(doc);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].question.choices.length, 2);
});
test('Forms section title listitems are not questions; unsupported questions remain detectable', () => {
  const doc = fixture(radio('A'));
  doc.querySelector('[role="list"]')!.insertAdjacentHTML('afterbegin', '<div role="listitem"><div role="heading" aria-level="2">PHẦN 1. HOẠT ĐỘNG VÀ NHU CẦU</div></div>');
  assert.equal(scanForm(doc).length, 1);
  assert.equal(scanForm(doc)[0].question.kind, 'radio');
  doc.querySelector('[role="list"]')!.insertAdjacentHTML('beforeend', '<div role="listitem"><div><div role="heading" aria-level="3">Tải tệp *</div></div><input type="file" required/></div>');
  assert.equal(scanForm(doc).length, 2);
  assert.equal(scanForm(doc)[1].question.kind, 'unsupported');
  assert.equal(scanForm(doc)[1].question.required, true);
});
test('scanner excludes disabled choices, keeps stable ids and current answers', () => {
  const doc = fixture(radio('Nam', 'aria-checked="true"') + radio('Nữ', 'aria-disabled="true"'));
  doc.querySelector('[role="radio"]')!.setAttribute('aria-checked', 'true');
  const first = scanForm(doc)[0].question;
  assert.equal(first.title, 'Câu hỏi'); assert.equal(first.required, true); assert.equal(first.answered, true);
  assert.equal(first.choices.length, 1); assert.equal(first.id, scanForm(doc)[0].question.id);
});
test('hidden questions and disabled ancestor choices are excluded', () => {
  const doc = fixture(`<div aria-disabled="true">${radio('A')}</div>${radio('B')}`);
  assert.equal(scanForm(doc)[0].question.choices[0].label, 'B');
  doc.querySelector('[role="listitem"]')!.setAttribute('hidden', '');
  assert.equal(scanForm(doc).length, 0);
});
test('grid rows preserve ids and require every row to be answered', () => {
  const doc = fixture(`<div role="radiogroup" aria-label="Dịch vụ">${radio('Tốt')}</div><div role="radiogroup" aria-label="Giá">${radio('Tốt')}</div>`);
  doc.querySelector('[role="radio"]')!.setAttribute('aria-checked', 'true');
  const question = scanForm(doc)[0].question;
  assert.equal(question.rows.length, 2); assert.equal(question.answered, false);
  assert.throws(() => validateAnswer(question, { questionId: question.id, rows: {} }));
  const rows = Object.fromEntries(question.rows.map(row => [row.id, [row.choices[0].id]]));
  assert.doesNotThrow(() => validateAnswer(question, { questionId: question.id, rows }));
});
test('random selection distinct, clamped and rules exact with fallback', () => {
  const options = [{ id: 'a', label: 'Nam' }, { id: 'b', label: 'Nữ' }];
  assert.deepEqual(choose(options, 1, ['nam']), ['a']);
  assert.equal(choose(options, 1, ['missing']).length, 1);
  assert.equal(new Set(choose(options, 20)).size, 2);
  assert.throws(() => choose([], 1));
});
test('random checkbox answers select from one through every available choice', async () => {
  const question = { id: 'q', title: 'Q', kind: 'checkbox' as const, choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }, { id: 'e', label: 'E' }], rows: [], answered: false, required: true };
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal((await planAnswer(question, DEFAULT_FILL, new AbortController().signal))?.choices?.length, 1);
    Math.random = () => 0.99;
    assert.equal((await planAnswer(question, DEFAULT_FILL, new AbortController().signal))?.choices?.length, 5);
  } finally {
    Math.random = originalRandom;
  }
});
test('preview validation rejects invented ids, duplicates, empty answers and unsafe config', () => {
  const question = scanForm(fixture(radio('A') + radio('B')))[0].question;
  assert.throws(() => validateAnswer(question, { questionId: question.id, choices: ['fake'] }));
  assert.throws(() => validateAnswer(question, { questionId: question.id, choices: [question.choices[0].id, question.choices[0].id] }));
  assert.throws(() => validateAnswer({ ...question, kind: 'text' }, { questionId: question.id, text: ' ' }));
  assert.doesNotThrow(() => validateFillSettings(DEFAULT_FILL));
  assert.throws(() => validateFillSettings({ ...DEFAULT_FILL, delay: -1 }));
});
