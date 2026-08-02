/* Prépare les documents normalisés d’un bloc pour leur affichage dans le cahier. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CJJournalDocuments = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function iconFor(document) {
    const mimeType = String(document.mimeType || '').toLowerCase();
    const title = String(document.title || '').toLowerCase();
    if (mimeType === 'application/pdf' || title.endsWith('.pdf')) return '📄';
    if (mimeType.includes('presentation') || /\.(pptx?|odp)$/.test(title)) return '📽️';
    if (mimeType.includes('wordprocessing') || /\.(docx?|odt)$/.test(title)) return '📝';
    return '📎';
  }

  function forBlock(block) {
    if (!block || block.type === 'break' || !Array.isArray(block.documents)) return [];
    return block.documents.flatMap(document => {
      if (!document || typeof document !== 'object') return [];
      if (typeof document.title !== 'string' || !document.title.trim()) return [];
      if (typeof document.url !== 'string' || !/^https:\/\//i.test(document.url)) return [];
      return [{ title: document.title.trim(), url: document.url, icon: iconFor(document) }];
    });
  }

  return { iconFor, forBlock };
});
