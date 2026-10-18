import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateFill } from '../ai/validation';
import { planAnswer, validateFillSettings } from '../content/answer-planner';
import { DEFAULT_FILL, type Question } from '../types';

const question: Question = { id: 'q4', title: 'Câu 4', kind: 'radio', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], rows: [], answered: false, required: true };
const settings = { ...DEFAULT_FILL, fixedAnswers: [{ questionId: question.id, page: 1, choices: ['a'] }] };
const signal = new AbortController().signal;

test('fixed choices survive settings round trips; other questions remain random', async () => {
  const random = Math.random;
  try {
    for (const value of [0, 0.99]) {
      Math.random = () => value;
      const restored = validateFill(JSON.parse(JSON.stringify(settings)));
      assert.deepEqual((await planAnswer(question, restored, signal))?.choices, ['a']);
      assert.deepEqual((await planAnswer({ ...question, id: 'other' }, restored, signal))?.choices, [value === 0 ? 'b' : 'a']);
      assert.deepEqual((await planAnswer(question, restored, signal, 2))?.choices, [value === 0 ? 'b' : 'a']);
    }
    assert.deepEqual((await planAnswer({ ...question, answered: true }, settings, signal))?.choices, ['a']);
    assert.deepEqual((await planAnswer({ ...question, kind: 'checkbox' }, settings, signal))?.choices, ['a']);
  } finally { Math.random = random; }
  await assert.rejects(() => planAnswer({ ...question, choices: [] }, settings, signal), /Đáp án/);
  assert.doesNotThrow(() => validateFill(DEFAULT_FILL));
});

test('fixed grid rows stay fixed; unconfigured rows still randomize', async () => {
  const grid: Question = { ...question, kind: 'radio-grid', choices: [], rows: [{ id: 'r1', label: 'Hàng 1', choices: question.choices }, { id: 'r2', label: 'Hàng 2', choices: question.choices }] };
  const fill = { ...DEFAULT_FILL, fixedAnswers: [{ questionId: grid.id, page: 1, rows: { r1: ['a'] } }] };
  const random = Math.random;
  try {
    Math.random = () => 0;
    assert.deepEqual((await planAnswer(grid, validateFill(fill), signal))?.rows, { r1: ['a'], r2: ['b'] });
  } finally { Math.random = random; }
  await assert.rejects(() => planAnswer({ ...grid, rows: [] }, fill, signal), /Hàng cố định/);
});

test('fixed settings reject malformed, duplicate and oversized selections', () => {
  for (const fixedAnswers of [null, {}, [{ questionId: 'q4', page: 0, choices: ['a'] }], [{ questionId: 'q4', page: 1, choices: [] }], [{ questionId: 'q4', page: 1, choices: ['a', 'a'] }], [{ questionId: 'q4', page: 1, choices: ['a'], rows: { r1: ['a'] } }], [settings.fixedAnswers[0], settings.fixedAnswers[0]], Array.from({ length: 101 }, (_, index) => ({ questionId: String(index), page: 1, choices: ['a'] }))]) {
    const fill = { ...DEFAULT_FILL, fixedAnswers };
    assert.throws(() => validateFill(fill));
    assert.throws(() => validateFillSettings(fill as typeof settings));
  }
});
