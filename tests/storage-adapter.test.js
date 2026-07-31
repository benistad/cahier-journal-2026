const { test } = require('node:test');
const assert = require('node:assert/strict');
const CJStorage = require('../js/storage-adapter.js');

// Mock localStorage en mémoire : les tests ne touchent jamais au vrai
// navigateur ni à un quelconque fichier sur disque.
function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    _dump: () => ({ ...store })
  };
}

test('la clé de stockage utilisée est bien "cj_data"', () => {
  assert.equal(CJStorage.STORAGE_KEY, 'cj_data');
});

test('sauvegarde puis rechargement depuis localStorage restitue les mêmes données', () => {
  const mock = createMockStorage();
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  const data = { '2026-06-15': { Lundi: { blocks: [{ type: 'subject', tag: 'Rituels', content: 'x' }], attachments: [] } } };

  adapter.save(data);
  const reloaded = adapter.load();

  assert.deepEqual(reloaded, data);
  assert.equal(mock.getItem('cj_data'), JSON.stringify(data));
});

test('import puis export ne perd aucune donnée', () => {
  const mock = createMockStorage();
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  const original = {
    '2026-06-15': {
      Lundi: { blocks: [{ type: 'subject', tag: 'Dictée', content: 'x' }], attachments: [{ name: 'a.pdf', url: 'data:...', size: '1 Ko' }] }
    }
  };
  const json = JSON.stringify(original);

  const imported = adapter.importData(json);
  const exported = adapter.exportData(imported);

  assert.deepEqual(JSON.parse(exported), original);
});

test('load() gère un JSON localStorage invalide en renvoyant {}', () => {
  const mock = createMockStorage({ cj_data: '{ceci nest pas du json valide' });
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  assert.deepEqual(adapter.load(), {});
});

test('load() renvoie {} quand localStorage est vide (première visite)', () => {
  const mock = createMockStorage();
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  assert.deepEqual(adapter.load(), {});
});

test('backup() copie les données sous une clé distincte sans modifier cj_data', () => {
  const mock = createMockStorage({ cj_data: '{"2026-06-15":{}}' });
  const adapter = CJStorage.createLocalStorageAdapter(mock);

  const backupKey = adapter.backup();

  assert.notEqual(backupKey, 'cj_data');
  assert.ok(backupKey.startsWith('cj_data_backup_'));
  assert.equal(mock.getItem(backupKey), '{"2026-06-15":{}}');
  assert.equal(mock.getItem('cj_data'), '{"2026-06-15":{}}'); // inchangé
});
