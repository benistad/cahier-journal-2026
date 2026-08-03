const { test } = require('node:test');
const assert = require('node:assert/strict');
const CJSchema = require('../js/journal-schema.js');
const CJOperations = require('../js/journal-operations.js');

const document = {
  provider: 'google_drive', fileId: 'drive-1', title: 'Fiche élève',
  url: 'https://drive.google.com/file/d/drive-1/view', mimeType: 'application/pdf', role: 'student_sheet'
};

function state() {
  return CJSchema.migrate({
    '2026-06-15': {
      Lundi: {
        blocks: [
          { type: 'subject', tag: 'Histoire', content: 'Séance 1' },
          { type: 'break', label: 'RECREATION' }
        ],
        attachments: []
      }
    }
  });
}

test('ajout, modification, déplacement et suppression de bloc fonctionnent sur une copie', () => {
  const original = state();
  const originalJson = JSON.stringify(original);
  const firstId = original.weeks['2026-06-15'].Lundi.blocks[0].id;
  const result = CJOperations.applyOperations(original, [
    { type: 'addBlock', weekKey: '2026-06-15', day: 'Lundi', block: { type: 'subject', tag: 'Calcul', content: 'Exercice', documents: [] } },
    { type: 'updateBlock', weekKey: '2026-06-15', day: 'Lundi', blockId: firstId, changes: { content: 'Séance modifiée' } },
    { type: 'moveBlock', weekKey: '2026-06-15', day: 'Lundi', blockId: firstId, toIndex: 2 },
    { type: 'deleteBlock', weekKey: '2026-06-15', day: 'Lundi', blockId: firstId }
  ], { atomic: true, idFactory: () => 'new-block-id' });

  assert.equal(result.errors.length, 0);
  assert.equal(result.acceptedOperations.length, 4);
  assert.ok(result.data.weeks['2026-06-15'].Lundi.blocks.some(block => block.id === 'new-block-id'));
  assert.equal(JSON.stringify(original), originalJson);
});

test('une activité peut être insérée directement entre deux blocs', () => {
  const original = state();
  const result = CJOperations.applyOperations(original, [{
    type: 'addBlock', weekKey: '2026-06-15', day: 'Lundi', index: 1,
    block: { type: 'subject', tag: 'Dictée', time: '9h15 – 9h45', content: 'Correction collective.', documents: [] }
  }], { atomic: true, idFactory: () => 'inline-block-id' });

  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    result.data.weeks['2026-06-15'].Lundi.blocks.map(block => block.id),
    [original.weeks['2026-06-15'].Lundi.blocks[0].id, 'inline-block-id', original.weeks['2026-06-15'].Lundi.blocks[1].id]
  );
});

test('association puis retrait d’un document normalisé fonctionnent', () => {
  const original = state();
  const blockId = original.weeks['2026-06-15'].Lundi.blocks[0].id;
  const associated = CJOperations.applyOperations(original, [
    { type: 'attachDocument', weekKey: '2026-06-15', day: 'Lundi', blockId, document }
  ], { atomic: true });
  assert.deepEqual(associated.data.weeks['2026-06-15'].Lundi.blocks[0].documents, [document]);

  const detached = CJOperations.applyOperations(associated.data, [
    { type: 'detachDocument', weekKey: '2026-06-15', day: 'Lundi', blockId, provider: 'google_drive', fileId: 'drive-1' }
  ], { atomic: true });
  assert.deepEqual(detached.data.weeks['2026-06-15'].Lundi.blocks[0].documents, []);
});

test('l’édition manuelle de la matière, du contenu et de l’horaire conserve les documents', () => {
  const original = state();
  const blockId = original.weeks['2026-06-15'].Lundi.blocks[0].id;
  const withDocument = CJOperations.applyOperations(original, [
    { type: 'attachDocument', weekKey: '2026-06-15', day: 'Lundi', blockId, document }
  ], { atomic: true });
  const edited = CJOperations.applyOperations(withDocument.data, [{
    type: 'updateBlock', weekKey: '2026-06-15', day: 'Lundi', blockId,
    changes: { tag: 'Dictée', time: '9h15 – 9h45', content: 'Correction collective.' }
  }], { atomic: true });

  const block = edited.data.weeks['2026-06-15'].Lundi.blocks[0];
  assert.equal(block.tag, 'Dictée');
  assert.equal(block.time, '9h15 – 9h45');
  assert.equal(block.content, 'Correction collective.');
  assert.deepEqual(block.documents, [document]);
  assert.deepEqual(withDocument.data.weeks['2026-06-15'].Lundi.blocks[0].documents, [document]);
});

test('un document incomplet ou avec un rôle inconnu est rejeté', () => {
  const original = state();
  const blockId = original.weeks['2026-06-15'].Lundi.blocks[0].id;
  const incomplete = CJOperations.applyOperations(original, [
    { type: 'attachDocument', weekKey: '2026-06-15', day: 'Lundi', blockId, document: { ...document, url: '' } }
  ]);
  const wrongRole = CJOperations.applyOperations(original, [
    { type: 'attachDocument', weekKey: '2026-06-15', day: 'Lundi', blockId, document: { ...document, role: 'manuel' } }
  ]);
  assert.equal(incomplete.rejectedOperations.length, 1);
  assert.match(incomplete.errors[0].message, /url/);
  assert.match(wrongRole.errors[0].message, /Rôle/);
});

test('le mode atomique annule tout le lot si une opération est invalide', () => {
  const original = state();
  const result = CJOperations.applyOperations(original, [
    { type: 'addBlock', weekKey: '2026-06-15', day: 'Lundi', block: { type: 'subject', tag: 'Calcul', content: '', documents: [] } },
    { type: 'deleteBlock', weekKey: '2026-06-15', day: 'Dimanche', blockId: 'absent' }
  ], { atomic: true, idFactory: () => 'new-id' });
  assert.deepEqual(result.data, original);
  assert.equal(result.acceptedOperations.length, 0);
  assert.equal(result.rejectedOperations.length, 2);
  assert.match(result.errors.at(-1).message, /atomique/);
});

test('le mode non atomique applique les opérations valides et détaille les rejets', () => {
  const original = state();
  const result = CJOperations.applyOperations(original, [
    { type: 'addBlock', weekKey: '2026-06-15', day: 'Lundi', block: { type: 'break', label: 'PAUSE' } },
    { type: 'deleteBlock', weekKey: '2026-06-15', day: 'Lundi', blockId: 'absent' }
  ], { idFactory: () => 'pause-id' });
  assert.equal(result.acceptedOperations.length, 1);
  assert.equal(result.rejectedOperations.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.data.weeks['2026-06-15'].Lundi.blocks.at(-1).id, 'pause-id');
});
