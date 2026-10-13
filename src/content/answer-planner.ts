import type { Answer, Choice, FillSettings, Question, Result } from '../types';
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
export async function planAnswer(question: Question, settings: FillSettings, signal: AbortSignal): Promise<Answer | undefined> {
  signal.throwIfAborted();
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
  const count = question.kind === 'checkbox' || question.kind === 'checkbox-grid' ? settings.checkboxCount : 1;
  if (question.kind.endsWith('grid')) return { questionId: question.id, rows: Object.fromEntries(question.rows.map(row => [row.id, choose(row.choices, count, rule?.answers)])) };
  return { questionId: question.id, choices: choose(question.choices, count, rule?.answers) };
}
export function validateFillSettings(value: FillSettings): void {
  if (!value || !['random', 'rules', 'ai'].includes(value.mode) || !Number.isInteger(value.delay) || value.delay < 0 || value.delay > 5000 || !Number.isInteger(value.checkboxCount) || value.checkboxCount < 1 || value.checkboxCount > 20 || !Array.isArray(value.rules) || value.rules.length > 100 || value.rules.some(rule => typeof rule.contains !== 'string' || !Array.isArray(rule.answers) || rule.answers.some(answer => typeof answer !== 'string')) || typeof value.personalContext !== 'string' || value.personalContext.length > 6000 || !['short', 'medium', 'long'].includes(value.answerLength) || !['auto', 'vi', 'en'].includes(value.language) || ['aiText', 'autoNext', 'autoSubmit', 'skipAnswered', 'preview', 'dark'].some(key => typeof value[key as keyof FillSettings] !== 'boolean')) {
    throw new Error('Cấu hình điền biểu mẫu không hợp lệ.');
  }
}
