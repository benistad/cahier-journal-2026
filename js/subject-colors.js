/* Classe les libellés du cahier dans les familles de couleurs pédagogiques. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CJSubjectColors = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const GROUPS = Object.freeze([
    'francais', 'maths', 'eps', 'anglais', 'histoire-geographie',
    'sciences', 'arts', 'musique', 'histoire-arts', 'emc', 'autre'
  ]);

  function normalize(label) {
    return String(label || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[’']/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function includesOne(label, terms) {
    return terms.some(term => label.includes(term));
  }

  function groupFor(label) {
    const value = normalize(label);
    if (!value) return 'autre';

    if (includesOne(value, ['histoire des arts', 'histoire de l art'])) return 'histoire-arts';
    if (includesOne(value, ['histoire', 'geographie', 'questionner le monde'])) return 'histoire-geographie';
    if (includesOne(value, ['mathematique', 'maths', 'numeration', 'calcul', 'geometrie', 'grandeurs', 'mesures', 'probleme', 'resolution'])) return 'maths';
    if (includesOne(value, ['eps', 'apq', 'education physique', 'sport'])) return 'eps';
    if (includesOne(value, ['anglais', 'english', 'langue vivante'])) return 'anglais';
    if (includesOne(value, ['sciences', 'science', 'technologie', 'vivant', 'matiere et objets'])) return 'sciences';
    if (includesOne(value, ['arts visuels', 'arts plastiques', 'art plastique', 'dessin'])) return 'arts';
    if (includesOne(value, ['musique', 'education musicale', 'chant', 'chorale'])) return 'musique';
    if (includesOne(value, ['emc', 'enseignement moral', 'education morale', 'education civique'])) return 'emc';
    if (includesOne(value, [
      'francais', 'dictee', 'edl', 'etude de la langue', 'etude du code',
      'grammaire', 'conjugaison', 'orthographe', 'vocabulaire', 'lexique',
      'lecture', 'litterature', 'redaction', 'production d ecrit', 'ecriture',
      'poesie', 'maitrise du geste'
    ])) return 'francais';

    return 'autre';
  }

  return { GROUPS, normalize, groupFor };
});
