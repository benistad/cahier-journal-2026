const { test } = require('node:test');
const assert = require('node:assert/strict');
const { forBlock, iconFor } = require('../js/journal-documents.js');

test('prépare les documents associés à une activité sans muter le bloc', () => {
  const block = {
    type: 'subject', tag: 'Français', content: 'Le présent',
    documents: [{
      provider: 'google_drive', fileId: 'pdf-1', title: 'Le présent.pdf',
      url: 'https://drive.google.com/file/d/pdf-1/view', mimeType: 'application/pdf', role: 'lesson'
    }]
  };
  const before = structuredClone(block);
  assert.deepEqual(forBlock(block), [{
    title: 'Le présent.pdf', url: 'https://drive.google.com/file/d/pdf-1/view', icon: '📄'
  }]);
  assert.deepEqual(block, before);
});

test('ignore les pauses et les documents incomplets ou non sécurisés', () => {
  assert.deepEqual(forBlock({ type: 'break', label: 'RECREATION', documents: [] }), []);
  assert.deepEqual(forBlock({
    type: 'subject', documents: [
      { title: '', url: 'https://drive.test/a' },
      { title: 'Fichier', url: 'javascript:alert(1)' }
    ]
  }), []);
});

test('choisit une icône lisible selon le type de document', () => {
  assert.equal(iconFor({ title: 'Diaporama.pptx', mimeType: '' }), '📽️');
  assert.equal(iconFor({ title: 'Fiche.docx', mimeType: '' }), '📝');
});
