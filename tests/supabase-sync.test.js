const { test } = require('node:test');
const assert = require('node:assert/strict');
const CJSupabaseSync = require('../js/supabase-sync.js');

function journal(tag = 'Rituels') {
  return {
    schemaVersion: 2,
    weeks: {
      '2026-06-15': {
        Lundi: { blocks: [{ id: 'b1', type: 'subject', tag, content: '', documents: [] }], attachments: [] }
      }
    }
  };
}

function fakeClient(options = {}) {
  const calls = [];
  const user = { id: 'user-1', email: 'owner@example.test' };
  const client = {
    calls,
    auth: {
      getSession: async () => ({ data: { session: options.session === null ? null : { user } }, error: null }),
      signInWithOtp: async credentials => {
        calls.push(['magicLink', credentials]);
        return { data: { session: { user } }, error: options.signInError || null };
      },
      signOut: async () => ({ error: null })
    },
    from: table => ({
      select: columns => ({
        eq: (field, value) => ({
          maybeSingle: async () => {
            calls.push(['select', table, columns, field, value]);
            return { data: options.remoteRow || null, error: options.selectError || null };
          }
        })
      })
    }),
    rpc: async (name, params) => {
      calls.push(['rpc', name, params]);
      if (name === 'save_journal' && options.saveError) return { data: null, error: options.saveError };
      const row = name === 'initialize_journal'
        ? { owner_id: user.id, revision: 1, data: params.p_initial_data, updated_at: '2026-08-01T00:00:00Z' }
        : { owner_id: user.id, revision: params.p_expected_revision + 1, data: params.p_new_data, updated_at: '2026-08-01T00:01:00Z' };
      return { data: row, error: null };
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {}
  };
  return client;
}

test('normalizeRow convertit la révision et migre les anciennes données', () => {
  const row = CJSupabaseSync.normalizeRow({
    owner_id: 'u1', revision: '3', updated_at: 'date',
    data: { '2026-06-15': { Lundi: { blocks: [], attachments: [] } } }
  });
  assert.equal(row.revision, 3);
  assert.equal(row.data.schemaVersion, 2);
});

test('data.json ne sert de graine que si aucun cahier local n’existe', () => {
  assert.equal(CJSupabaseSync.shouldSeedFromPublished({}), true);
  assert.equal(CJSupabaseSync.shouldSeedFromPublished(journal()), false);
});

test('fetchCurrent filtre explicitement sur l’utilisateur connecté', async () => {
  const client = fakeClient({ remoteRow: { owner_id: 'user-1', revision: 2, data: journal(), updated_at: 'date' } });
  const sync = CJSupabaseSync.createSyncClient(client);
  const row = await sync.fetchCurrent();
  assert.equal(row.revision, 2);
  assert.deepEqual(client.calls[0].slice(3), ['owner_id', 'user-1']);
});

test('le lien de connexion ne peut pas créer un autre utilisateur', async () => {
  const client = fakeClient();
  const sync = CJSupabaseSync.createSyncClient(client);
  await sync.sendMagicLink('owner@example.test', 'https://example.test/journal/');
  assert.deepEqual(client.calls[0], ['magicLink', {
    email: 'owner@example.test',
    options: { shouldCreateUser: false, emailRedirectTo: 'https://example.test/journal/' }
  }]);
});

test('initialize envoie uniquement le schéma courant et mémorise la révision', async () => {
  const client = fakeClient();
  const sync = CJSupabaseSync.createSyncClient(client);
  const row = await sync.initialize({ '2026-06-15': { Lundi: { blocks: [], attachments: [] } } });
  assert.equal(row.revision, 1);
  assert.equal(sync.getRevision(), 1);
  assert.equal(client.calls.at(-1)[2].p_initial_data.schemaVersion, 2);
});

test('save utilise la révision attendue et retourne la nouvelle révision', async () => {
  const client = fakeClient({ remoteRow: { owner_id: 'user-1', revision: 4, data: journal(), updated_at: 'date' } });
  const sync = CJSupabaseSync.createSyncClient(client);
  await sync.fetchCurrent();
  const result = await sync.save(journal('Calcul'));
  assert.equal(result.status, 'saved');
  assert.equal(result.row.revision, 5);
  assert.equal(client.calls.at(-1)[2].p_expected_revision, 4);
});

test('save signale un conflit sans considérer l’écriture comme réussie', async () => {
  const client = fakeClient({
    remoteRow: { owner_id: 'user-1', revision: 4, data: journal(), updated_at: 'date' },
    saveError: { code: '40001', message: 'Journal revision conflict' }
  });
  const sync = CJSupabaseSync.createSyncClient(client);
  await sync.fetchCurrent();
  const result = await sync.save(journal('Calcul'));
  assert.equal(result.status, 'conflict');
  assert.equal(sync.getRevision(), 4);
});

test('une session est obligatoire pour lire ou écrire', async () => {
  const sync = CJSupabaseSync.createSyncClient(fakeClient({ session: null }));
  await assert.rejects(() => sync.fetchCurrent(), /Session requise/);
  await assert.rejects(() => sync.initialize(journal()), /Session requise/);
});
