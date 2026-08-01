export function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function classifyRole(title: string, mimeType = '') {
  const text = normalizeText(title);
  if (/\b(correction|corrige|corrigee)\b/.test(text)) return 'correction';
  if (/\b(evaluation|controle)\b/.test(text)) return 'assessment';
  if (/\b(fiche enseignant|guide enseignant|pour l enseignant)\b/.test(text)) return 'teacher_sheet';
  if (/\b(fiche eleve|fiche eleves|support eleve|supports eleves)\b/.test(text)) return 'student_sheet';
  if (/\b(diaporama|presentation|slides?)\b/.test(text) || mimeType === 'application/vnd.google-apps.presentation') return 'slideshow';
  if (/\b(lecon|trace ecrite|memo)\b/.test(text)) return 'lesson';
  if (/\b(exercice|exercices|entrainement)\b/.test(text)) return 'exercise';
  if (/\b(sequence|progression)\b/.test(text)) return 'sequence';
  return 'other';
}

export function deriveHierarchy(path: string[]) {
  const subjectIndex = path.findIndex(part => /^\s*\d+\s*[-–—]/.test(part));
  const subject = subjectIndex >= 0 ? path[subjectIndex].replace(/^\s*\d+\s*[-–—]\s*/, '') : null;
  const sequenceIndex = path.findIndex((part, index) => index > subjectIndex && /^sequence\b/.test(normalizeText(part)));
  const sequence = sequenceIndex >= 0 ? path[sequenceIndex].replace(/^\s*s[ée]quence\s*[-–—]\s*/i, '') : null;
  const notionParts = sequenceIndex >= 0
    ? path.slice(subjectIndex + 1, sequenceIndex)
    : path.slice(subjectIndex + 1);
  return { subject, notion: notionParts.at(-1) || null, sequence };
}
