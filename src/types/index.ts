export type QuestionKind = 'radio' | 'checkbox' | 'dropdown' | 'scale' | 'radio-grid' | 'checkbox-grid' | 'text' | 'paragraph' | 'unsupported';
export interface Choice { id: string; label: string }
export interface Question {
  id: string; title: string; kind: QuestionKind; choices: Choice[];
  rows: { id: string; label: string; choices: Choice[] }[];
  answered: boolean; required: boolean;
}
export interface Answer { questionId: string; text?: string; choices?: string[]; rows?: Record<string, string[]>; error?: string }
export interface Rule { contains: string; answers: string[] }
export interface FillSettings {
  mode: 'random' | 'rules' | 'ai'; aiText: boolean; delay: number; checkboxCount: number;
  autoNext: boolean; autoSubmit: boolean; skipAnswered: boolean; preview: boolean; rules: Rule[];
  personalContext: string; answerLength: 'short' | 'medium' | 'long'; language: 'auto' | 'vi' | 'en'; dark: boolean;
}
export interface APISettings {
  provider: 'openai' | 'custom'; baseUrl: string; apiKey: string; model: string;
  temperature: number; maxTokens: number; systemPrompt: string; timeout: number; retryCount: number;
}
export interface EngineState {
  phase: 'idle' | 'planning' | 'preview' | 'filling' | 'done' | 'stopped' | 'error';
  questions: Question[]; answers: Answer[]; completed: number; failed: number; page: number; logs: string[];
  submitted?: number; target?: number;
}
export type ContentCommand = { type: 'SCAN' | 'STATUS' | 'STOP' | 'RESET' } | { type: 'START'; settings: FillSettings; quantity?: number } | { type: 'APPLY'; answers: Answer[] };
export interface Result<T> { ok: boolean; data?: T; error?: string }
export const DEFAULT_FILL: FillSettings = {
  mode: 'random', aiText: false, delay: 350, checkboxCount: 4, autoNext: false, autoSubmit: false,
  skipAnswered: true, preview: true, rules: [], personalContext: '', answerLength: 'medium', language: 'auto', dark: false,
};
export const DEFAULT_API: APISettings = {
  provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini',
  temperature: 0.7, maxTokens: 300, systemPrompt: '', timeout: 20000, retryCount: 1,
};
