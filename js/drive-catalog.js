/* Catalogue Drive pur : classement, dédoublonnage et recherche sans IA. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CJDriveCatalog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DOCUMENT_ROLES = [
    'sequence', 'teacher_sheet', 'student_sheet', 'slideshow', 'lesson',
    'exercise', 'assessment', 'correction', 'other'
  ];

  const MIME_FOLDER = 'application/vnd.google-apps.folder';

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[’']/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function classifyRole(title, mimeType = '') {
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

  function deriveHierarchy(path) {
    const folders = Array.isArray(path) ? path.filter(Boolean) : [];
    const subjectIndex = folders.findIndex(part => /^\s*\d+\s*[-–—]/.test(part));
    const subjectFolder = subjectIndex >= 0 ? folders[subjectIndex] : '';
    const subject = subjectFolder.replace(/^\s*\d+\s*[-–—]\s*/, '') || null;
    const sequenceIndex = folders.findIndex((part, index) => index > subjectIndex && /^sequence\b/.test(normalizeText(part)));
    const sequenceFolder = sequenceIndex >= 0 ? folders[sequenceIndex] : '';
    const sequence = sequenceFolder.replace(/^\s*s[ée]quence\s*[-–—]\s*/i, '') || null;
    const afterSubject = subjectIndex >= 0 ? folders.slice(subjectIndex + 1) : folders;
    const beforeSequence = sequenceIndex >= 0
      ? folders.slice(subjectIndex + 1, sequenceIndex)
      : afterSubject;
    const notion = beforeSequence.length ? beforeSequence[beforeSequence.length - 1] : null;
    return { subject, notion, sequence };
  }

  function canonicalTitle(title) {
    return normalizeText(String(title || '')
      .replace(/\.(pdf|docx?|pptx?|xlsx?)$/i, '')
      .replace(/\s*[-–—]\s*(rendu fidèle|version finale|finale?|source)\s*$/i, ''));
  }

  function filePreference(document) {
    const mimeType = document.mimeType || document.mime_type || '';
    const title = document.title || document.name || '';
    let score = 0;
    if (mimeType === 'application/pdf' || /\.pdf$/i.test(title)) score += 100;
    if (/\b(rendu fidèle|version finale|finale?)\b/i.test(title)) score += 20;
    if (/\.(docx?|odt)$/i.test(title)) score -= 10;
    return score;
  }

  function normalizeDocument(file, path = []) {
    if (!file || typeof file !== 'object') throw new Error('Fichier Drive invalide');
    const fileId = file.fileId || file.file_id || file.id;
    const title = file.title || file.name;
    const url = file.url || file.webViewLink || file.web_view_link;
    const mimeType = file.mimeType || file.mime_type || '';
    if (!fileId || !title || !url || !mimeType || mimeType === MIME_FOLDER) throw new Error('Métadonnées Drive incomplètes');
    const hierarchy = deriveHierarchy(path);
    const role = DOCUMENT_ROLES.includes(file.role) ? file.role : classifyRole(title, mimeType);
    return {
      provider: 'google_drive',
      fileId,
      title,
      url,
      mimeType,
      role,
      path: Array.isArray(path) ? [...path] : [],
      subject: file.subject || hierarchy.subject,
      notion: file.notion || hierarchy.notion,
      sequence: file.sequence || hierarchy.sequence,
      modifiedTime: file.modifiedTime || file.modified_time || null,
      indexedText: file.indexedText || file.indexed_text || ''
    };
  }

  function preferFinalVersions(documents) {
    const selected = new Map();
    documents.forEach(document => {
      const key = canonicalTitle(document.title);
      const current = selected.get(key);
      if (!current || filePreference(document) > filePreference(current)) selected.set(key, document);
    });
    return [...selected.values()];
  }

  function searchCatalog(documents, query, options = {}) {
    const tokens = normalizeText(query).split(' ').filter(Boolean);
    if (!tokens.length) return [];
    const roles = Array.isArray(options.roles) ? options.roles.filter(role => DOCUMENT_ROLES.includes(role)) : [];
    const normalized = documents.map(document => normalizeDocument(document, document.path));
    const ranked = normalized.flatMap(document => {
      if (roles.length && !roles.includes(document.role)) return [];
      const title = normalizeText(document.title);
      const hierarchy = normalizeText([document.subject, document.notion, document.sequence, ...document.path].join(' '));
      const content = normalizeText(document.indexedText);
      const matches = tokens.map(token => title.includes(token) || hierarchy.includes(token) || content.includes(token));
      if (!matches.every(Boolean)) return [];
      const score = tokens.reduce((total, token) => total
        + (title.includes(token) ? 12 : 0)
        + (hierarchy.includes(token) ? 5 : 0)
        + (content.includes(token) ? 1 : 0), 0)
        + filePreference(document);
      return [{ document, score }];
    });
    const preferredIds = new Set(preferFinalVersions(ranked.map(item => item.document)).map(item => item.fileId));
    return ranked
      .filter(item => preferredIds.has(item.document.fileId))
      .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title, 'fr'))
      .slice(0, Math.min(options.limit || 5, 5))
      .map(item => item.document);
  }

  function toJournalDocument(document) {
    const normalized = normalizeDocument(document, document.path);
    return {
      provider: normalized.provider,
      fileId: normalized.fileId,
      title: normalized.title,
      url: normalized.url,
      mimeType: normalized.mimeType,
      role: normalized.role
    };
  }

  return {
    DOCUMENT_ROLES,
    MIME_FOLDER,
    normalizeText,
    classifyRole,
    deriveHierarchy,
    canonicalTitle,
    filePreference,
    normalizeDocument,
    preferFinalVersions,
    searchCatalog,
    toJournalDocument
  };
});
