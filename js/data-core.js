/* ═══════════════════════════════════════════════════════════
   CJData — fonctions pures de calcul de semaines/jours et de
   fusion de données. Aucune dépendance au DOM, ni à localStorage,
   ni à fetch. Utilisable tel quel dans le navigateur (<script>)
   ou dans Node (require) pour les tests.
═══════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CJData = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

  // Identique à l'implémentation historique (index.html) : renvoie la clé
  // (lundi, format YYYY-MM-DD) de la semaine décalée de `offset` semaines
  // par rapport à la semaine de `refDate`.
  function weekKey(offset = 0, refDate = new Date()) {
    const d = new Date(refDate);
    const day = d.getDay() || 7; // 1=Lundi … 7=Dimanche (fix bug dimanche)
    d.setDate(d.getDate() - day + 1 + offset * 7);
    return d.toISOString().slice(0, 10);
  }

  function weekMonday(key) {
    return new Date(key + 'T12:00:00');
  }

  function weekLabel(key) {
    const d = weekMonday(key);
    const e = new Date(d);
    e.setDate(d.getDate() + 4);
    const f = dt => dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });
    return `${f(d)} – ${f(e)} ${e.getFullYear()}`;
  }

  function dayDate(key, i) {
    const d = weekMonday(key);
    d.setDate(d.getDate() + i);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  // Complète une semaine avec les 5 jours attendus, sans jamais écraser
  // un jour déjà présent (mêmes règles que l'ancien ensureWeek()).
  function normalizeWeek(week) {
    const w = week || {};
    DAYS.forEach(d => {
      if (!w[d]) w[d] = { blocks: [], attachments: [] };
    });
    return w;
  }

  // Mutation en place de `data[key]`, comme l'ancien ensureWeek(key).
  function ensureWeek(data, key) {
    if (!data[key]) data[key] = {};
    data[key] = normalizeWeek(data[key]);
    return data[key];
  }

  function getDayData(data, day, key) {
    ensureWeek(data, key);
    return data[key][day];
  }

  // ─────────────────────────────────────────────────────────
  // Fusion distante : COMPORTEMENT CONSERVÉ TEL QUEL (étape 1 = refactoring
  // pur, pas de correction fonctionnelle). Règle actuelle : chaque semaine
  // présente dans `remote` remplace ENTIÈREMENT la semaine locale de même
  // clé (fusion au niveau "semaine", pas jour par jour, pas de comparaison
  // de date de mise à jour). Les semaines présentes uniquement en local
  // sont conservées car Object.assign ne touche pas les clés absentes de
  // `remote`.
  //
  // Ce comportement est risqué (voir ARCHITECTURE.md §4) mais volontairement
  // conservé à l'identique ici : il sera revu lors de la migration vers la
  // synchronisation distante (étape suivante), pas à cette étape.
  // ─────────────────────────────────────────────────────────
  function mergeRemoteIntoLocal(local, remote) {
    Object.assign(local, remote);
    return local;
  }

  return {
    DAYS,
    weekKey,
    weekMonday,
    weekLabel,
    dayDate,
    normalizeWeek,
    ensureWeek,
    getDayData,
    mergeRemoteIntoLocal
  };
});
