/* ═══════════════════════════════════════════════════════════
   CJRemote — source distante d'initialisation (data.json).
   Volontairement isolée de l'adaptateur localStorage : aujourd'hui
   c'est un fichier statique servi par GitHub Pages, demain ce sera
   un backend de synchronisation. Le contrat (fetchRemoteData →
   objet data ou null) ne change pas selon la source.
═══════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CJRemote = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Identique à l'ancien loadRemote() : fetch tolérant, résout `null`
  // en cas d'échec réseau/parse (offline, dev local, etc.) plutôt que
  // de lever une exception.
  async function fetchRemoteData(url = 'data.json', fetchImpl) {
    const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!doFetch) return null;
    try {
      const r = await doFetch(url + '?t=' + Date.now());
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  return { fetchRemoteData };
});
