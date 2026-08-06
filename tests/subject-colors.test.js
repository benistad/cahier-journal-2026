const test = require('node:test');
const assert = require('node:assert/strict');
const SubjectColors = require('../js/subject-colors');

test('classe les sous-domaines de français en bleu', () => {
  ['Français', 'Dictée', 'EDL – Grammaire', 'Conjugaison', 'Lecture', "Production d'écrit", 'Poésie']
    .forEach(label => assert.equal(SubjectColors.groupFor(label), 'francais', label));
});

test('classe les sous-domaines de mathématiques en rouge', () => {
  ['Maths', 'Numération', 'Calcul Mental', 'Géométrie', 'Mesures', 'Résolution de problèmes']
    .forEach(label => assert.equal(SubjectColors.groupFor(label), 'maths', label));
});

test('reprend toutes les familles de la référence visuelle', () => {
  const examples = {
    EPS: 'eps', APQ: 'eps', Anglais: 'anglais', Histoire: 'histoire-geographie',
    Géographie: 'histoire-geographie', Sciences: 'sciences', Technologie: 'sciences',
    'Arts visuels': 'arts', Musique: 'musique', 'Histoire des arts': 'histoire-arts', EMC: 'emc'
  };
  Object.entries(examples).forEach(([label, group]) => assert.equal(SubjectColors.groupFor(label), group, label));
});

test('garde les libellés transversaux dans une famille neutre', () => {
  ['Rituels', 'Méthodologie', 'Sortie', ''].forEach(label => {
    assert.equal(SubjectColors.groupFor(label), 'autre', label);
  });
});
