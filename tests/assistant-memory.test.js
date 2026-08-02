const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRule, isMemoryCommand, extractRule, createMemoryClient
} = require('../js/assistant-memory.js');

test('reconnaît et extrait les formulations naturelles de mémorisation', () => {
  assert.equal(isMemoryCommand('Retiens que la correction de la dictée reste dans Dictée.'), true);
  assert.equal(extractRule('Retiens que la correction de la dictée reste dans Dictée.'), 'la correction de la dictée reste dans Dictée.');
  assert.equal(extractRule('À partir de maintenant, les problèmes restent dans Rituels.'), 'les problèmes restent dans Rituels.');
  assert.equal(extractRule('Souviens-toi que la cantine est une pause.'), 'la cantine est une pause.');
  assert.equal(extractRule('Nous faisons une dictée.'), null);
});

test('normalise les espaces et limite la taille des règles', () => {
  assert.equal(normalizeRule('  Une   seule règle.  '), 'Une seule règle.');
  assert.throws(() => normalizeRule('x'), /entre 3 et 500/);
  assert.throws(() => normalizeRule('x'.repeat(501)), /entre 3 et 500/);
});

test('le client Supabase liste, ajoute et supprime seulement les règles du propriétaire', async () => {
  const calls = [];
  const rows = [{ id: 7, rule: 'La correction de dictée reste dans Dictée.', created_at: '2026-08-02T12:00:00Z' }];
  const builder = {
    select(fields) { calls.push(['select', fields]); return this; },
    order(field, options) { calls.push(['order', field, options]); return this; },
    limit(value) { calls.push(['limit', value]); return Promise.resolve({ data: rows, error: null }); },
    insert(value) { calls.push(['insert', value]); return this; },
    single() { return Promise.resolve({ data: rows[0], error: null }); },
    delete() { calls.push(['delete']); return this; },
    eq(field, value) {
      calls.push(['eq', field, value]);
      if (field === 'owner_id') return Promise.resolve({ error: null });
      return this;
    }
  };
  const client = { from(table) { calls.push(['from', table]); return builder; } };
  const memory = createMemoryClient(client);
  assert.equal((await memory.list())[0].id, '7');
  await memory.add('La correction de dictée reste dans Dictée.', 'user-1');
  await memory.remove('7', 'user-1');
  assert.ok(calls.some(call => call[0] === 'insert' && call[1].owner_id === 'user-1'));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'owner_id' && call[2] === 'user-1'));
});
