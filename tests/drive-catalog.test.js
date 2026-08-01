const { test } = require('node:test');
const assert = require('node:assert/strict');
const DriveCatalog = require('../js/drive-catalog.js');

const presentPath = ['CM1-CM2 — 2026-2027', '1 - Français', 'Conjugaison', 'Le présent'];
const presentPdf = {
  id: 'pdf-present', title: 'Le présent — leçon CM1-CM2 — rendu fidèle.pdf',
  mime_type: 'application/pdf', url: 'https://drive.google.com/file/d/pdf-present/view', path: presentPath
};
const presentDocx = {
  id: 'docx-present', title: 'Le présent — leçon CM1-CM2.docx',
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  url: 'https://drive.google.com/file/d/docx-present/view', path: presentPath
};

test('les rôles sont déduits des titres réels du Drive', () => {
  assert.equal(DriveCatalog.classifyRole('Séance 1 — Entrer dans le Moyen Âge — Fiche enseignant'), 'teacher_sheet');
  assert.equal(DriveCatalog.classifyRole('Séance 1 — Entrer dans le Moyen Âge — Diaporama'), 'slideshow');
  assert.equal(DriveCatalog.classifyRole('Supports élèves — Multiplier deux nombres entiers'), 'student_sheet');
  assert.equal(DriveCatalog.classifyRole('Correction — Fractions'), 'correction');
});

test('la hiérarchie matière, notion et séquence vient uniquement du chemin réel', () => {
  assert.deepEqual(DriveCatalog.deriveHierarchy([
    'CM1-CM2 — 2026-2027', '3 - Histoire', 'Moyen Âge',
    'Séquence — Vivre dans une seigneurie', 'Séances'
  ]), { subject: 'Histoire', notion: 'Moyen Âge', sequence: 'Vivre dans une seigneurie' });
});

test('le PDF final est préféré au DOCX source pour une même leçon', () => {
  const results = DriveCatalog.searchCatalog([presentDocx, presentPdf], 'présent leçon');
  assert.equal(results.length, 1);
  assert.equal(results[0].fileId, 'pdf-present');
  assert.equal(results[0].mimeType, 'application/pdf');
});

test('la recherche est insensible aux accents et limitée à cinq résultats réels', () => {
  const documents = Array.from({ length: 8 }, (_, index) => ({
    id: `h${index}`, title: `Séance ${index + 1} — Moyen Âge — Fiche enseignant`,
    mime_type: 'application/vnd.google-apps.document',
    url: `https://docs.google.com/document/d/h${index}/edit`,
    path: ['CM1-CM2 — 2026-2027', '3 - Histoire', 'Moyen Âge']
  }));
  const results = DriveCatalog.searchCatalog(documents, 'moyen age enseignant', { limit: 20 });
  assert.equal(results.length, 5);
  assert.ok(results.every(document => document.role === 'teacher_sheet'));
});

test('aucun résultat ni document n’est inventé si les mots ne correspondent pas', () => {
  assert.deepEqual(DriveCatalog.searchCatalog([presentPdf], 'division décimale'), []);
});

test('le document associé au journal ne contient que les champs normalisés', () => {
  assert.deepEqual(DriveCatalog.toJournalDocument(presentPdf), {
    provider: 'google_drive', fileId: 'pdf-present',
    title: presentPdf.title, url: presentPdf.url,
    mimeType: 'application/pdf', role: 'lesson'
  });
});
