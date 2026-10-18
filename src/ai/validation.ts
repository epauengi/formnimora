import type { APISettings, Choice, FillSettings, FixedAnswer, Question, QuestionKind } from '../types';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid payload.');
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, min = 0): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw new Error('Invalid text length.');
  return value;
}

function number(value: unknown, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error('Invalid numeric setting.');
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid boolean setting.');
  return value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error('Invalid setting.');
  return value as T;
}

export function endpoint(baseUrl: string): URL {
  if (typeof baseUrl !== 'string' || baseUrl.length > 2048) throw new Error('Invalid API URL.');
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error('Invalid API URL.'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) throw new Error('Use HTTPS, or HTTP on localhost only; no credentials, query or fragment.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url;
}

export function validateAPI(value: unknown): APISettings {
  const v = object(value);
  const baseUrl = text(v.baseUrl, 2048, 1).trim();
  endpoint(baseUrl);
  const apiKey = text(v.apiKey, 4096).trim();
  if (/[\r\n\x00]/.test(apiKey)) throw new Error('Invalid API key.');
  const model = text(v.model, 200, 1).trim();
  if (!model || /[\x00-\x1f]/.test(model)) throw new Error('Invalid model.');
  return {
    provider: oneOf(v.provider, ['openai', 'custom']), baseUrl, apiKey, model,
    temperature: number(v.temperature, 0, 2), maxTokens: number(v.maxTokens, 1, 4096, true),
    systemPrompt: text(v.systemPrompt, 8000), timeout: number(v.timeout, 1000, 25000, true),
    retryCount: number(v.retryCount, 0, 3, true),
  };
}

export function validateFixedAnswers(value: unknown): FixedAnswer[] {
  if (!Array.isArray(value) || value.length > 100 || JSON.stringify(value).length > 50000) throw new Error('Invalid fixed answers.');
  const ids = (value: unknown): string[] => {
    if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('Invalid fixed choices.');
    const result = value.map(id => text(id, 128, 1));
    if (new Set(result).size !== result.length) throw new Error('Duplicate fixed choices.');
    return result;
  };
  const result = value.map(value => {
    const v = object(value);
    const answer: FixedAnswer = { questionId: text(v.questionId, 128, 1), page: number(v.page, 1, 20, true) };
    if ((v.choices === undefined) === (v.rows === undefined)) throw new Error('Invalid fixed answer structure.');
    if (v.choices !== undefined) answer.choices = ids(v.choices);
    if (v.rows !== undefined) {
      const rows = Object.entries(object(v.rows));
      if (!rows.length || rows.length > 50) throw new Error('Invalid fixed rows.');
      answer.rows = Object.fromEntries(rows.map(([id, choices]) => {
        text(id, 128, 1);
        if (['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error('Invalid row ID.');
        return [id, ids(choices)];
      }));
    }
    return answer;
  });
  if (new Set(result.map(answer => `${answer.page}:${answer.questionId}`)).size !== result.length) throw new Error('Duplicate fixed questions.');
  return result;
}

export function validateFill(value: unknown): FillSettings {
  const v = object(value);
  if (!Array.isArray(v.rules) || v.rules.length > 100) throw new Error('Too many rules.');
  const rules = v.rules.map(value => {
    const rule = object(value);
    if (!Array.isArray(rule.answers) || rule.answers.length > 100) throw new Error('Invalid rule answers.');
    return { contains: text(rule.contains, 500, 1), answers: rule.answers.map(answer => text(answer, 2000, 1)) };
  });
  if (JSON.stringify(rules).length > 50000) throw new Error('Rules are too large.');
  return {
    mode: oneOf(v.mode, ['random', 'rules', 'ai']), aiText: boolean(v.aiText),
    delay: number(v.delay, 0, 5000, true), checkboxCount: number(v.checkboxCount, 1, 20, true),
    autoNext: boolean(v.autoNext), autoSubmit: boolean(v.autoSubmit ?? false), skipAnswered: boolean(v.skipAnswered), preview: boolean(v.preview), rules,
    personalContext: text(v.personalContext, 6000), answerLength: oneOf(v.answerLength, ['short', 'medium', 'long']),
    language: oneOf(v.language, ['auto', 'vi', 'en']), dark: boolean(v.dark),
    ...(v.fixedAnswers !== undefined ? { fixedAnswers: validateFixedAnswers(v.fixedAnswers) } : {}),
  };
}

function choices(value: unknown): Choice[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid choices.');
  const result = value.map(item => {
    const v = object(item);
    return { id: text(v.id, 128, 1), label: text(v.label, 2000) };
  });
  if (new Set(result.map(item => item.id)).size !== result.length) throw new Error('Duplicate choice IDs.');
  return result;
}

export function validateQuestion(value: unknown): Question {
  const v = object(value);
  const kind = oneOf<QuestionKind>(v.kind, ['radio', 'checkbox', 'dropdown', 'scale', 'radio-grid', 'checkbox-grid', 'text', 'paragraph']);
  if (!Array.isArray(v.rows) || v.rows.length > 50) throw new Error('Invalid grid rows.');
  const rows = v.rows.map(value => {
    const row = object(value);
    const id = text(row.id, 128, 1);
    if (['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error('Invalid row ID.');
    return { id, label: text(row.label, 2000), choices: choices(row.choices) };
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate row IDs.');
  const question: Question = {
    id: text(v.id, 128, 1), title: text(v.title, 8000, 1), kind, choices: choices(v.choices), rows,
    answered: boolean(v.answered), required: boolean(v.required),
  };
  const grid = kind.endsWith('-grid');
  if (grid ? !rows.length || rows.some(row => !row.choices.length) : rows.length > 0) throw new Error('Invalid question structure.');
  if (!grid && kind !== 'text' && kind !== 'paragraph' && !question.choices.length) throw new Error('Question has no choices.');
  if (rows.reduce((sum, row) => sum + row.choices.length, question.choices.length) > 500 || JSON.stringify(question).length > 50000) throw new Error('Question is too large.');
  return question;
}

export function validateRequestId(value: unknown): string {
  const id = text(value, 128, 1);
  if (!/^[a-zA-Z0-9_.:-]+$/.test(id)) throw new Error('Invalid request ID.');
  return id;
}
