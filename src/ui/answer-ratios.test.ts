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
  const settings = validateFill({ ...DEFAULT_FILL, answerRatios: [{ questionId: 'q1', choices: [{ choiceId: 'a', percent: 25 }, { choiceId: 'b', percent: 25 }, { choiceId: 'c', percent: 50 }] }] });
  const planned = [];
  for (let index = 0; index < 100; index++) planned.push((await planAnswer(question, settings, new AbortController().signal, 1, index, 100))?.choices?.[0]);
  assert.deepEqual(planned, ordered);
});

test('ratios reject incomplete totals, duplicates and invalid selections', () => {
  assert.throws(() => validateAnswerRatios([{ questionId: 'q1', choices: [{ choiceId: 'a', percent: 50 }, { choiceId: 'b', percent: 50 }, { choiceId: 'c', percent: 0 }] }, { questionId: 'q1', choices: [{ choiceId: 'a', percent: 100 }] }]));
  assert.throws(() => validateAnswerRatios([{ questionId: 'q1', choices: [{ choiceId: 'a', percent: 60 }, { choiceId: 'b', percent: 30 }, { choiceId: 'c', percent: 0 }] }]));
});
