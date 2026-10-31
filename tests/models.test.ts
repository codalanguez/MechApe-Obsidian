import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelCatalog, searchModels } from '../src/model-picker';

test('model search matches multiple words in IDs, ignores case and removes duplicates', () => {
  const models = ['anthropic/claude-haiku-4.5', 'openai/gpt-4.1', 'anthropic/claude-sonnet-4.5', 'openai/gpt-4.1', ''];
  assert.deepEqual(searchModels(models, ' CLAUDE   haiku '), ['anthropic/claude-haiku-4.5']);
  assert.deepEqual(searchModels(models, '4.5 anthropic'), [models[0], models[2]]);
  assert.deepEqual(searchModels(models, 'unknown'), []);
  assert.deepEqual(searchModels(models, ''), models.slice(0, 3));
});

test('model catalogs isolate providers, endpoints and credentials while preserving selection', async () => {
  const catalog = new ModelCatalog();
  const connection = { baseUrl: 'https://example.com/v1', apiKey: 'test', model: 'custom-model' };
  await catalog.refresh('openrouter', connection, async () => ({ status: 200, json: { data: [{id:'b'}, {id:'a'}, {id:'a'}] } }));
  assert.deepEqual(catalog.get('openrouter', connection), ['a', 'b']);
  assert.deepEqual(catalog.get('anthropic', connection), []);
  assert.deepEqual(catalog.get('openrouter', {...connection, baseUrl:'https://other.example/v1'}), []);
  assert.deepEqual(catalog.get('openrouter', {...connection, apiKey:'changed'}), []);
  assert.equal(connection.model, 'custom-model');
});

test('failed model refresh preserves the previous catalog and supports retry', async () => {
  const catalog = new ModelCatalog();
  const connection = {baseUrl:'http://localhost:11434', apiKey:'', model:''};
  const success = async () => ({status:200, json:{models:[{name:'local-model'}]}});
  await catalog.refresh('ollama', connection, success);
  await assert.rejects(catalog.refresh('ollama', connection, async () => ({status:401,json:{}})));
  assert.deepEqual(catalog.get('ollama', connection), ['local-model']);
  await catalog.refresh('ollama', connection, success);
  assert.equal(connection.model, '');
});
