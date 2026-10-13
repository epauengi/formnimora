import { DEFAULT_API, DEFAULT_FILL, type APISettings, type FillSettings } from '../types';
import { endpoint, validateAPI, validateFill } from '../ai/validation';

let secured: Promise<void> | undefined;
export function secureStorage(): Promise<void> {
  return secured ??= chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}

export async function requireEndpointPermission(baseUrl: string): Promise<void> {
  const origin = endpoint(baseUrl).origin;
  if (!await chrome.permissions.contains({ origins: [`${origin}/*`] })) throw new Error('Grant permission for the API endpoint in extension settings.');
}

export async function getAPI(): Promise<APISettings> {
  await secureStorage();
  const data = await chrome.storage.local.get('apiSettings');
  return validateAPI(data.apiSettings ?? DEFAULT_API);
}

export async function saveAPI(value: unknown): Promise<boolean> {
  const settings = validateAPI(value);
  await secureStorage();
  await requireEndpointPermission(settings.baseUrl);
  await chrome.storage.local.set({ apiSettings: settings });
  return true;
}

export async function deleteKey(): Promise<boolean> {
  const settings = await getAPI();
  await chrome.storage.local.set({ apiSettings: { ...settings, apiKey: '' } });
  return true;
}

export async function getFill(): Promise<FillSettings> {
  await secureStorage();
  const data = await chrome.storage.local.get('fillSettings');
  return { ...validateFill(data.fillSettings ?? DEFAULT_FILL), autoSubmit: false };
}

export async function saveFill(value: unknown): Promise<boolean> {
  const settings = { ...validateFill(value), autoSubmit: false };
  await secureStorage();
  await chrome.storage.local.set({ fillSettings: settings });
  return true;
}
