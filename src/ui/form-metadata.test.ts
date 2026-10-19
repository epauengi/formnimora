import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { allFormQuestions, formPage } from '../content/form-metadata';
import { scanForm } from '../content/form-scanner';
import { planAnswer, validateAnswer } from '../content/answer-planner';
import { DEFAULT_FILL } from '../types';
import { AutoFillEngine } from '../content/auto-filler';

const item = [101, 'Câu hỏi', null, 4, [[201, [['A'], ['B'], ['C'], ['D'], ['', null, null, null, true]], true, null, [[7, 201, ['3'], 'Tối đa 3']]]]];
function setup() {
  const data = [null, [null, [item, [301, 'Nhánh B', null, 8], [102, 'Câu hỏi khác', null, 5, [[202, [['1'], ['2']], true]]]]]];
  const dom = new JSDOM(`<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(data)};</script><form data-first-entry="0"><div role="listitem"><div data-params=""><h3 role="heading">Câu hỏi *</h3>${['A', 'B', 'C', 'D'].map(label => `<div role="checkbox" aria-label="${label}" aria-checked="false"></div>`).join('')}<div role="checkbox" data-value="__other_option__" aria-checked="false"></div></div></div></form>`);
  dom.window.document.querySelector('[data-params]')!.setAttribute('data-params', '%.@.' + JSON.stringify([item, 'i1']).slice(1));
  for (const key of ['HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLOptionElement', 'HTMLButtonElement', 'Event', 'MutationObserver'] as const) Object.assign(globalThis, { [key]: dom.window[key] });
  Object.assign(globalThis, { document: dom.window.document, getComputedStyle: dom.window.getComputedStyle.bind(dom.window) });
  return dom;
}

test('Forms metadata lists every section, keeps stable item IDs and checkbox limits', async () => {
  const dom = setup();
  try {
    const pages = allFormQuestions();
    assert.equal(pages.length, 2);
    assert.equal(pages[1].title, 'Nhánh B');
    const question = scanForm()[0].question;
    assert.equal(question.id, 'item-101');
    assert.equal(question.maxChoices, 3);
    assert.deepEqual(question.choices, pages[0].questions[0].choices);
    assert.equal(question.choices.length, 4, 'Other needs text, never randomize it.');
    const random = Math.random;
    try {
      Math.random = () => 0.999;
      const answer = await planAnswer(question, DEFAULT_FILL, new AbortController().signal);
      assert.equal(answer?.choices?.length, 3);
      assert.throws(() => validateAnswer(question, { questionId: question.id, choices: question.choices.map(choice => choice.id) }), /giới hạn/);
    } finally { Math.random = random; }
    dom.window.document.querySelector('form')!.setAttribute('data-first-entry', '2');
    assert.equal(formPage(), 2, 'Page follows section metadata, not visited-page count.');
  } finally { dom.window.close(); }
});

test('engine clicks Forms role controls, not decorative captions, after hydration', async () => {
  const dom = setup();
  try {
    Object.assign(globalThis, { chrome: { runtime: { sendMessage: async () => ({ ok: true, data: true }) } } });
    const root = document.querySelector('[role="listitem"]')!;
    root.innerHTML = '<h3 role="heading">Năm học</h3><label><div jscontroller="test" class="RDPZE" role="radio" aria-label="Năm 1" aria-checked="false"></div><span class="aDTYNe">Năm 1</span></label>';
    const radio = root.querySelector<HTMLElement>('[role="radio"]')!;
    let clicks = 0;
    radio.addEventListener('click', () => { clicks++; assert.ok(!radio.classList.contains('RDPZE')); radio.setAttribute('aria-checked', 'true'); });
    const engine = new AutoFillEngine(() => {}, () => 'https://docs.google.com/forms/d/e/test/viewform');
    engine.start({ ...DEFAULT_FILL, preview: false, delay: 0 });
    assert.equal(clicks, 0);
    radio.classList.remove('RDPZE');
    for (let i = 0; i < 100 && engine.state.phase !== 'done'; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(engine.state.phase, 'done', engine.state.logs.join('\n'));
    assert.equal(engine.state.failed, 0);
    assert.equal(clicks, 1);
  } finally { dom.window.close(); }
});

test('malformed metadata falls back to visible DOM without evaluating scripts', () => {
  const dom = setup();
  try {
    dom.window.document.querySelector('script')!.textContent = 'var FB_PUBLIC_LOAD_DATA_ = (() => { throw Error("must not execute"); })();';
    assert.deepEqual(allFormQuestions(), []);
    dom.window.document.querySelector('[data-params]')!.setAttribute('data-params', 'broken');
    assert.match(scanForm()[0].question.id, /^q0-/);
    assert.equal(formPage(document, 4), 4);
  } finally { dom.window.close(); }
});
