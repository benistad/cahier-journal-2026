const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDriveClient } = require('../js/drive-client.js');

function fakeClient() {
  const calls = [];
  const rows = [{
    file_id: 'pdf-1', title: 'Le présent — leçon finale.pdf', mime_type: 'application/pdf',
    web_view_link: 'https://drive.google.com/file/d/pdf-1/view', modified_time: '2026-07-28T12:00:00Z',
    path: ['CM1-CM2 — 2026-2027', '1 - Français', 'Conjugaison', 'Le présent'],
    subject: 'Français', notion: 'Le présent', sequence: null, role: 'lesson', content_excerpt: ''
  }];
  return {
    calls,
    functions: {
      invoke: async (name, options) => {
        calls.push(['invoke', name, options]);
        return name === 'drive-auth-start'
          ? { data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth' }, error: null }
          : { data: { mode: 'full', indexedFileCount: 1 }, error: null };
      }
    },
    from: table => ({
      select: columns => {
        calls.push(['select', table, columns]);
        if (table === 'drive_connection_status') return {
          maybeSingle: async () => ({ data: { connected: true, indexed_file_count: 1 }, error: null })
        };
        return {
          order: () => ({ limit: async () => ({ data: rows, error: null }) })
        };
      }
    })
  };
}

test('le client obtient une URL OAuth uniquement depuis la fonction serveur', async () => {
  const client = fakeClient();
  const drive = createDriveClient(client);
  const url = await drive.startOAuth();
  assert.equal(url, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepEqual(client.calls[0], ['invoke', 'drive-auth-start', { body: {} }]);
});

test('la synchronisation Drive passe uniquement par la fonction serveur', async () => {
  const client = fakeClient();
  const drive = createDriveClient(client);
  assert.deepEqual(await drive.sync(), { mode: 'full', indexedFileCount: 1 });
});

test('le catalogue distant alimente le moteur pur sans inventer de résultat', async () => {
  const drive = createDriveClient(fakeClient());
  await drive.loadCatalog();
  assert.equal(drive.search('présent français')[0].fileId, 'pdf-1');
  assert.deepEqual(drive.search('Moyen Âge'), []);
});
