// Run: npx tsx src/ui/shared.test.ts
import assert from 'node:assert/strict';
import { DEFAULT_API } from '../types';
import { apiOrigin, isFormUrl, unwrap, validateApi } from './shared';

assert.equal(isFormUrl('https://docs.google.com/forms/d/e/form-id/viewform?usp=sf_link'), true);
for (const url of ['http://docs.google.com/forms/d/id/viewform', 'https://docs.google.com.evil.test/forms/d/id/viewform', 'https://docs.google.com/forms/d/id/edit', 'https://docs.google.com:8443/forms/d/id/viewform', 'https://docs.google.com/forms/viewform', undefined]) assert.equal(isFormUrl(url), false);
assert.equal(apiOrigin('https://api.openai.com/v1'), 'https://api.openai.com/*');
assert.equal(apiOrigin('http://localhost:8080/v1'), 'http://localhost:8080/*');
for (const url of ['http://example.com/v1', 'https://user:pass@example.com/v1', 'https://example.com/v1?key=secret', 'https://example.com/v1#fragment']) assert.throws(() => apiOrigin(url));
assert.equal(validateApi(DEFAULT_API), 'https://api.openai.com/*');
assert.throws(() => validateApi({ ...DEFAULT_API, maxTokens: NaN }));
assert.throws(() => validateApi({ ...DEFAULT_API, timeout: 25001 }));
assert.throws(() => unwrap({ ok: false, error: 'failure' }), /failure/);
assert.throws(() => unwrap(undefined));
assert.equal(unwrap({ ok: true, data: false }), false);
console.log('UI URL, permission and response checks passed.');
