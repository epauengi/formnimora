import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAnswerRatios, validateFill } from '../ai/validation';
import { allocateRatioChoices, planAnswer } from '../content/answer-planner';
import { DEFAULT_FILL, type Question } from '../types';

const choices = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
const question: Question = { id: 'q1', title: 'Câu 1', kind: 'radio', choices, rows: [], answered: false, required: true };

test('ratio allocation matches percentages exactly, including remainder', async () => {
  const ordered = allocateRatioChoices(choices, [25, 25, 50], 100);
  assert.deepEqual(choices.map(choice => ordered.filter(id => id === choice.id).length), [25, 25, 50]);
  assert.deepEqual(choices.map(choice => allocateRatioChoices(choices, [34, 33, 33], 3).filter(id => id === choice.id).length), [1, 1, 1]);
  const settings = validateFill({ ...DEFAULT_FILL, answerRatios: [{ questionId: 'q1', page: 1, choices: [{ choiceId: 'a', percent: 25 }, { choiceId: 'b', percent: 25 }, { choiceId: 'c', percent: 50 }] }] });
  const planned = [];
  for (let index = 0; index < 100; index++) planned.push((await planAnswer(question, settings, new AbortController().signal, 1, index, 100))?.choices?.[0]);
  assert.deepEqual(planned, ordered);
});

test('page-scoped ratios do not leak into later pages with repeated local IDs', async () => {
  const settings = validateFill({ ...DEFAULT_FILL, answerRatios: [{ questionId: 'q0-repeat', page: 1, choices: [{ choiceId: 'a', percent: 100 }] }] });
  const laterQuestion = { ...question, id: 'q0-repeat', choices: [{ id: 'different', label: 'Different page choice' }] };
  assert.deepEqual((await planAnswer(laterQuestion, settings, new AbortController().signal, 2))?.choices?.length, 1);
  assert.deepEqual((await planAnswer(laterQuestion, settings, new AbortController().signal, 2))?.choices?.[0], 'different');
});

test('fixed text survives checkpoints and overrides existing text only on its configured page', async () => {
  const textQuestion: Question = { ...question, kind: 'text', choices: [], answered: true };
  const settings = validateFill({ ...DEFAULT_FILL, fixedTextAnswers: [{ questionId: 'q1', page: 1, text: 'Trường thử nghiệm' }] });
  assert.deepEqual((await planAnswer(textQuestion, settings, new AbortController().signal))?.text, 'Trường thử nghiệm');
  assert.equal(await planAnswer(textQuestion, settings, new AbortController().signal, 2), undefined);
  assert.deepEqual(validateFill(JSON.parse(JSON.stringify(settings))), settings);
  assert.throws(() => validateFill({ ...settings, fixedTextAnswers: [{ questionId: 'q1', page: 1, text: ' ' }] }));
});

test('short text samples one nonblank line per response; paragraphs keep their newlines', async () => {
  const textQuestion: Question = { ...question, kind: 'text', choices: [] };
  const text = '  Trường A  \r\n\r\n Trường B \n \nTrường C\r';
  const settings = validateFill(JSON.parse(JSON.stringify({ ...DEFAULT_FILL, fixedTextAnswers: [{ questionId: 'q1', page: 1, text }] })));
  const signal = new AbortController().signal;
  const random = Math.random;
  try {
    const picked = [];
    for (const [index, value] of [0, 0.5, 0.999].entries()) {
      Math.random = () => value;
      picked.push((await planAnswer(textQuestion, settings, signal, 1, index, 3))?.text);
    }
    assert.deepEqual(picked, ['Trường A', 'Trường B', 'Trường C']);
    assert.equal((await planAnswer({ ...textQuestion, kind: 'paragraph' }, settings, signal))?.text, text);
    await assert.rejects(() => planAnswer(textQuestion, { ...settings, fixedTextAnswers: [{ questionId: 'q1', page: 1, text: '\n \r\n' }] }, signal), /trống/);
  } finally { Math.random = random; }
});

test('ratios reject incomplete totals, duplicates and invalid selections', () => {
  assert.throws(() => validateAnswerRatios([{ questionId: 'q1', page: 1, choices: [{ choiceId: 'a', percent: 50 }, { choiceId: 'b', percent: 50 }, { choiceId: 'c', percent: 0 }] }, { questionId: 'q1', page: 1, choices: [{ choiceId: 'a', percent: 100 }] }]));
  assert.throws(() => validateAnswerRatios([{ questionId: 'q1', page: 0, choices: [{ choiceId: 'a', percent: 60 }, { choiceId: 'b', percent: 40 }] }]));
  assert.throws(() => validateAnswerRatios([{ questionId: 'q1', page: 1, choices: [{ choiceId: 'a', percent: 60 }, { choiceId: 'b', percent: 30 }, { choiceId: 'c', percent: 0 }] }]));
});
