const { test } = require('node:test');
const assert = require('node:assert/strict');
const CJStorage = require('../js/storage-adapter.js');
const CJSchema = require('../js/journal-schema.js');

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
  const data = CJSchema.migrate({ '2026-06-15': { Lundi: { blocks: [{ type: 'subject', tag: 'Rituels', content: 'x' }], attachments: [] } } });

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

  assert.deepEqual(JSON.parse(exported), CJSchema.migrate(original));
});

test('load() gère un JSON localStorage invalide en renvoyant {}', () => {
  const mock = createMockStorage({ cj_data: '{ceci nest pas du json valide' });
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  assert.deepEqual(adapter.load(), { schemaVersion: 2, weeks: {} });
});

test('load() renvoie {} quand localStorage est vide (première visite)', () => {
  const mock = createMockStorage();
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  assert.deepEqual(adapter.load(), { schemaVersion: 2, weeks: {} });
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

test('la sauvegarde pré-Supabase est unique et ne peut pas être écrasée', () => {
  const mock = createMockStorage({ cj_data: '{"premiere":true}' });
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  assert.equal(adapter.backupBeforeRemoteMigration(), true);
  mock.setItem('cj_data', '{"seconde":true}');
  assert.equal(adapter.backupBeforeRemoteMigration(), false);
  assert.equal(mock.getItem(CJStorage.PRE_REMOTE_BACKUP_KEY), '{"premiere":true}');
});

test('les métadonnées de synchronisation sont validées à la lecture et à l’écriture', () => {
  const mock = createMockStorage();
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  assert.deepEqual(adapter.loadSyncMeta(), { revision: null, dirty: false, ownerId: null });
  adapter.saveSyncMeta({ revision: 4, dirty: true, ownerId: 'user-1', ignored: 'x' });
  assert.deepEqual(adapter.loadSyncMeta(), { revision: 4, dirty: true, ownerId: 'user-1' });
});

test('une copie de conflit est enregistrée sous une clé de récupération distincte', () => {
  const mock = createMockStorage({ cj_data: '{"courant":true}' });
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  const key = adapter.saveConflict({ schemaVersion: 2, weeks: {} }, 1234);
  assert.equal(key, 'cj_conflict_1234');
  assert.equal(mock.getItem(key), '{"schemaVersion":2,"weeks":{}}');
  assert.equal(mock.getItem('cj_data'), '{"courant":true}');
});
