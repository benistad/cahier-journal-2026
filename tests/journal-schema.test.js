const { test } = require('node:test');
const assert = require('node:assert/strict');
const CJSchema = require('../js/journal-schema.js');
const CJStorage = require('../js/storage-adapter.js');

function legacyFixture() {
  return {
    '2026-06-08': {
      Lundi: {
        blocks: [
          { type: 'subject', tag: 'Histoire', time: '9h00', content: '- [Diaporama](docs/test.pptx)' },
          { type: 'break', label: 'RECREATION' }
        ],
        attachments: [{ name: 'fiche.pdf', url: 'data:application/pdf;base64,AAA', size: '1 Ko' }]
      },
      Mercredi: { blocks: [], attachments: [] }
    },
    '2026-06-15': {}
  };
}

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: key => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); },
    _dump: () => ({ ...store })
  };
}

test('la migration historique produit le schéma explicite courant sans muter la source', () => {
  const source = legacyFixture();
  const before = JSON.stringify(source);
  const migrated = CJSchema.migrate(source);
  assert.equal(migrated.schemaVersion, CJSchema.SCHEMA_VERSION);
  assert.deepEqual(Object.keys(migrated.weeks), ['2026-06-08', '2026-06-15']);
  assert.equal(JSON.stringify(source), before);
});

test('la migration conserve semaines vides, jours, ordre, horaires, pauses, liens et pièces jointes', () => {
  const migrated = CJSchema.migrate(legacyFixture());
  const monday = migrated.weeks['2026-06-08'].Lundi;
  assert.equal(monday.blocks[0].time, '9h00');
  assert.equal(monday.blocks[0].content, '- [Diaporama](docs/test.pptx)');
  assert.equal(monday.blocks[1].label, 'RECREATION');
  assert.deepEqual(monday.attachments, [{ name: 'fiche.pdf', url: 'data:application/pdf;base64,AAA', size: '1 Ko' }]);
  assert.deepEqual(migrated.weeks['2026-06-08'].Mercredi.blocks, []);
  assert.deepEqual(migrated.weeks['2026-06-15'], {});
});

test('tous les blocs, pauses comprises, reçoivent un identifiant stable', () => {
  const first = CJSchema.migrate(legacyFixture());
  const second = CJSchema.migrate(legacyFixture());
  const ids1 = first.weeks['2026-06-08'].Lundi.blocks.map(block => block.id);
  const ids2 = second.weeks['2026-06-08'].Lundi.blocks.map(block => block.id);
  assert.deepEqual(ids1, ids2);
  assert.ok(ids1.every(id => id.startsWith('legacy-')));
});

test('la migration est idempotente', () => {
  const once = CJSchema.migrate(legacyFixture());
  assert.deepEqual(CJSchema.migrate(once), once);
});

test('chaque activité reçoit un tableau documents sans modifier les pauses', () => {
  const blocks = CJSchema.migrate(legacyFixture()).weeks['2026-06-08'].Lundi.blocks;
  assert.deepEqual(blocks[0].documents, []);
  assert.equal(Object.prototype.hasOwnProperty.call(blocks[1], 'documents'), false);
});

test('createId utilise une fabrique injectable pour rester testable', () => {
  assert.equal(CJSchema.createId(() => 'id-test-1'), 'id-test-1');
});

test('la première migration localStorage sauvegarde une seule fois la valeur historique', () => {
  const original = JSON.stringify(legacyFixture());
  const mock = createMockStorage({ cj_data: original });
  const adapter = CJStorage.createLocalStorageAdapter(mock);
  adapter.load();
  assert.equal(mock.getItem(CJStorage.PRE_MIGRATION_BACKUP_KEY), original);

  mock.setItem('cj_data', JSON.stringify({ autre: 'valeur' }));
  adapter.load();
  assert.equal(mock.getItem(CJStorage.PRE_MIGRATION_BACKUP_KEY), original);
});

test('import historique puis export courant conserve le contenu utile', () => {
  const adapter = CJStorage.createLocalStorageAdapter(createMockStorage());
  const imported = adapter.importData(JSON.stringify(legacyFixture()));
  const exported = JSON.parse(adapter.exportData(imported));
  assert.deepEqual(exported, CJSchema.migrate(legacyFixture()));
});
