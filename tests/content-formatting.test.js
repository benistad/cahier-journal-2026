const test = require('node:test');
const assert = require('node:assert/strict');
const Formatting = require('../js/content-formatting');

test('entoure la sélection pour la mettre en gras', () => {
  assert.deepEqual(Formatting.wrapSelection('Une dictée courte', 4, 10, '**', 'texte'), {
    text: 'Une **dictée** courte',
    selectionStart: 6,
    selectionEnd: 12
  });
});

test('insère un texte sélectionnable quand rien n’est sélectionné', () => {
  assert.deepEqual(Formatting.wrapSelection('Correction : ', 13, 13, '__', 'à souligner'), {
    text: 'Correction : __à souligner__',
    selectionStart: 15,
    selectionEnd: 26
  });
});
