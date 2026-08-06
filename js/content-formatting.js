/* Fonctions pures utilisées par la mini-barre de mise en forme. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CJFormatting = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function wrapSelection(text, selectionStart, selectionEnd, marker, placeholder) {
    const source = String(text || '');
    const start = Math.max(0, Math.min(Number(selectionStart) || 0, source.length));
    const end = Math.max(start, Math.min(Number(selectionEnd) || start, source.length));
    const token = String(marker || '');
    const selected = source.slice(start, end) || String(placeholder || 'texte');
    const replacement = `${token}${selected}${token}`;
    return {
      text: source.slice(0, start) + replacement + source.slice(end),
      selectionStart: start + token.length,
      selectionEnd: start + token.length + selected.length
    };
  }

  return { wrapSelection };
});
