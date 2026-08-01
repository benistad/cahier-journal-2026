import { classifyRole, deriveHierarchy, normalizeText } from './catalog.ts';

Deno.test('le classement serveur reconnaît les rôles pédagogiques réels', () => {
  if (classifyRole('Séance 1 — Fiche enseignant') !== 'teacher_sheet') throw new Error('fiche enseignant');
  if (classifyRole('Séance 1 — Diaporama') !== 'slideshow') throw new Error('diaporama');
  if (classifyRole('Le présent — leçon CM1-CM2.pdf') !== 'lesson') throw new Error('leçon');
});

Deno.test('la hiérarchie serveur reste issue du chemin Drive', () => {
  const hierarchy = deriveHierarchy([
    'CM1-CM2 — 2026-2027',
    '3 — Histoire',
    'Moyen Âge',
    'Séquence — Vivre dans une seigneurie',
    'Séances'
  ]);
  if (hierarchy.subject !== 'Histoire') throw new Error('matière');
  if (hierarchy.notion !== 'Moyen Âge') throw new Error('notion');
  if (hierarchy.sequence !== 'Vivre dans une seigneurie') throw new Error('séquence');
});

Deno.test('la normalisation serveur est insensible aux accents', () => {
  if (normalizeText('Moyen Âge') !== 'moyen age') throw new Error('normalisation');
});
