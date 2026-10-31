import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, persistedSettings } from '../src/config';

test('session keys never survive settings save and reload, without erasing the active connection', () => {
  const settings = loadSettings(null);
  settings.connections.openrouter.apiKey = 'synthetic-session-key';
  settings.project = 'Book';
  const disk = persistedSettings(settings);
  assert.equal(disk.connections.openrouter.apiKey, '');
  assert.equal(settings.connections.openrouter.apiKey, 'synthetic-session-key');
  assert.equal(loadSettings(disk).connections.openrouter.apiKey, '');
  assert.equal(loadSettings(disk).project, 'Book');
});

test('legacy saved keys migrate without loss; opt-out removes all persisted provider keys', () => {
  const legacy = loadSettings(null);
  for (const connection of Object.values(legacy.connections)) connection.apiKey = 'synthetic-legacy-key';
  const raw: any = structuredClone(legacy); delete raw.rememberApiKeys;
  const settings = loadSettings(raw);
  assert.equal(settings.rememberApiKeys, true);
  assert.equal(persistedSettings(settings).connections.anthropic.apiKey, 'synthetic-legacy-key');
  settings.rememberApiKeys = false;
  const reloaded = loadSettings(persistedSettings(settings));
  assert.equal(reloaded.rememberApiKeys, false);
  for (const connection of Object.values(reloaded.connections)) assert.equal(connection.apiKey, '');
});

test('untrusted settings cannot inject an unknown provider or mistyped connection values', () => {
  const settings = loadSettings({ provider: '__proto__', connections: { ollama: { apiKey: 123, model: 'test' } }, toolsEnabled: 'yes', project: 123 });
  assert.equal(settings.provider, 'ollama');
  assert.equal(settings.connections.ollama.apiKey, '');
  assert.equal(settings.connections.ollama.model, 'test');
  assert.equal(settings.project, '');
  assert.equal(settings.toolsEnabled, true);
});
