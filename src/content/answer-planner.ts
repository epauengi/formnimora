import type { Answer, Choice, FillSettings, Question, Result } from '../types';
import { validateAnswerRatios, validateFixedAnswers } from '../ai/validation';
export function choose(options: Choice[], count: number, rule?: string[]): string[] {
  if (!options.length) throw new Error('Không tìm thấy lựa chọn hợp lệ.');
  if (rule?.length) {
    const matches = rule.map(value => options.find(option => option.label.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase())?.id);
    if (matches.every((id): id is string => !!id)) return [...new Set(matches)].slice(0, count);
  }
  const pool = [...options];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length)).map(option => option.id);
}
export function allocateRatioChoices(choices: Choice[], percentages: number[], responseCount: number): string[] {
  const allocations = choices.map((choice, index) => ({ choice, count: Math.floor(responseCount * percentages[index] / 100), remainder: responseCount * percentages[index] % 100 }));
  let remaining = responseCount - allocations.reduce((sum, item) => sum + item.count, 0);
  [...allocations].sort((a, b) => b.remainder - a.remainder || choices.indexOf(a.choice) - choices.indexOf(b.choice)).slice(0, remaining).forEach(item => item.count++);
  return allocations.flatMap(item => Array.from({ length: item.count }, (_, index) => ({ id: item.choice.id, position: (index + 0.5) / item.count })))
    .sort((a, b) => a.position - b.position || choices.findIndex(choice => choice.id === a.id) - choices.findIndex(choice => choice.id === b.id))
    .map(item => item.id);
}
export function validateAnswer(question: Question, answer: Answer): void {
  if (answer.questionId !== question.id || answer.error) throw new Error('Câu trả lời không khớp câu hỏi.');
  if (question.kind === 'text' || question.kind === 'paragraph') {
    if (typeof answer.text !== 'string' || !answer.text.trim() || answer.text.length > 12000) throw new Error('Nội dung trống hoặc quá dài.');
    return;
  }
  function validate(ids: unknown, choices: Choice[], multiple: boolean) {
    if (!Array.isArray(ids) || !ids.length || ids.length > choices.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !choices.some(choice => choice.id === id)) || (!multiple && ids.length !== 1)) {
      throw new Error('Đáp án phải thuộc danh sách lựa chọn hiện tại.');
    }
  }
  if (question.kind.endsWith('grid')) {
    if (!answer.rows || Object.keys(answer.rows).length !== question.rows.length) throw new Error('Thiếu hàng trong bảng.');
    question.rows.forEach(row => validate(answer.rows![row.id], row.choices, question.kind === 'checkbox-grid'));
  } else validate(answer.choices, question.choices, question.kind === 'checkbox');
}
export async function planAnswer(question: Question, settings: FillSettings, signal: AbortSignal, page = 1, responseIndex = 0, responseCount = 1): Promise<Answer | undefined> {
  signal.throwIfAborted();
  const countFor = (choices: Choice[]) => settings.mode === 'random' && (question.kind === 'checkbox' || question.kind === 'checkbox-grid')
    ? 1 + Math.floor(Math.random() * choices.length)
    : question.kind === 'checkbox' || question.kind === 'checkbox-grid' ? settings.checkboxCount : 1;
  const ratio = settings.answerRatios?.find(answer => answer.questionId === question.id);
  if (ratio) {
    if (!['radio', 'dropdown', 'scale'].includes(question.kind) || ratio.choices.length !== question.choices.length || ratio.choices.some(item => !question.choices.some(choice => choice.id === item.choiceId)) || !Number.isInteger(responseIndex) || responseIndex < 0 || responseIndex >= responseCount) throw new Error('Tỉ lệ không khớp lựa chọn câu hỏi hiện tại.');
    const ordered = allocateRatioChoices(question.choices, question.choices.map(choice => ratio.choices.find(item => item.choiceId === choice.id)!.percent), responseCount);
    return { questionId: question.id, choices: [ordered[responseIndex]] };
  }
  const fixed = settings.fixedAnswers?.find(answer => answer.questionId === question.id && answer.page === page);
  if (fixed) {
    if (['text', 'paragraph', 'unsupported'].includes(question.kind)) throw new Error('Đáp án cố định chỉ hỗ trợ câu trắc nghiệm.');
    if (fixed.rows && Object.keys(fixed.rows).some(id => !question.rows.some(row => row.id === id))) throw new Error('Hàng cố định không còn trong câu hỏi hiện tại.');
    const answer: Answer = structuredClone({ questionId: fixed.questionId, ...(fixed.choices ? { choices: fixed.choices } : {
      rows: Object.fromEntries(question.rows.map(row => [row.id, fixed.rows?.[row.id] || choose(row.choices, countFor(row.choices))])),
    }) });
    validateAnswer(question, answer);
    return answer;
  }
  if (question.kind === 'unsupported' || (settings.skipAnswered && question.answered)) return;
  const isText = question.kind === 'text' || question.kind === 'paragraph';
  if (isText && !settings.aiText) return;
  if (isText || settings.mode === 'ai') {
    const result = await chrome.runtime.sendMessage({ type: 'AI_ANSWER', requestId: crypto.randomUUID(), question, settings }) as Result<Answer>;
    signal.throwIfAborted();
    if (!result?.ok || !result.data) throw new Error(result?.error || 'Không nhận được câu trả lời từ AI.');
    validateAnswer(question, result.data);
    return result.data;
  }
  const rule = settings.mode === 'rules' ? settings.rules.find(rule => question.title.toLocaleLowerCase().includes(rule.contains.trim().toLocaleLowerCase()) && rule.contains.trim()) : undefined;
  if (question.kind.endsWith('grid')) return { questionId: question.id, rows: Object.fromEntries(question.rows.map(row => [row.id, choose(row.choices, countFor(row.choices), rule?.answers)])) };
  return { questionId: question.id, choices: choose(question.choices, countFor(question.choices), rule?.answers) };
}
export function validateFillSettings(value: FillSettings): void {
  if (value?.fixedAnswers !== undefined) validateFixedAnswers(value.fixedAnswers);
  if (value?.answerRatios !== undefined) validateAnswerRatios(value.answerRatios);
  if (!value || !['random', 'rules', 'ai'].includes(value.mode) || !Number.isInteger(value.delay) || value.delay < 0 || value.delay > 5000 || !Number.isInteger(value.checkboxCount) || value.checkboxCount < 1 || value.checkboxCount > 20 || !Array.isArray(value.rules) || value.rules.length > 100 || value.rules.some(rule => typeof rule.contains !== 'string' || !Array.isArray(rule.answers) || rule.answers.some(answer => typeof answer !== 'string')) || typeof value.personalContext !== 'string' || value.personalContext.length > 6000 || !['short', 'medium', 'long'].includes(value.answerLength) || !['auto', 'vi', 'en'].includes(value.language) || ['aiText', 'autoNext', 'autoSubmit', 'skipAnswered', 'preview', 'dark'].some(key => typeof value[key as keyof FillSettings] !== 'boolean')) {
    throw new Error('Cấu hình điền biểu mẫu không hợp lệ.');
  }
}
