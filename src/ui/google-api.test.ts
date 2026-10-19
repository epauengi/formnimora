import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChatAdapter, answerQuestion } from '../ai/adapter';
import { validateAPI, endpoint } from '../ai/validation';
import { validateApi } from './shared';
import { DEFAULT_API, DEFAULT_FILL, type Question } from '../types';

test('Google Gemini uses the official OpenAI-compatible endpoint and existing secure transport', async () => {
  const api = { ...DEFAULT_API, provider: 'google' as const, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', apiKey: 'fixture-google-key' };
  assert.deepEqual(validateAPI(JSON.parse(JSON.stringify(api))), api);
  assert.equal(validateApi(api), 'https://generativelanguage.googleapis.com/*');
  assert.equal(endpoint(api.baseUrl + '/').href, api.baseUrl + '/chat/completions');
  let requests = 0;
  const question: Question = { id: 'q1', title: 'Chọn một', kind: 'radio', choices: [{ id: 'a', label: 'A' }], rows: [], required: true, answered: false };
  const adapter = createChatAdapter({
    checkPermission: async url => { assert.equal(url, api.baseUrl); },
    fetch: async (url, init) => {
      requests++;
      assert.equal(String(url), api.baseUrl + '/chat/completions');
      assert.equal(new URL(String(url)).search, '');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer fixture-google-key');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert.equal(JSON.parse(String(init?.body)).model, api.model);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"choices":["a"]}' } }] }));
    },
  });
  assert.deepEqual(await answerQuestion(adapter, question, { ...DEFAULT_FILL, mode: 'ai' }, api), { questionId: 'q1', choices: ['a'] });
  assert.equal(requests, 1);
  const denied = createChatAdapter({ checkPermission: async () => { throw new Error('Permission denied.'); }, fetch: async () => { throw new Error('Must not send credentials.'); } });
  await assert.rejects(denied.complete([], api), /Permission denied/);
});
