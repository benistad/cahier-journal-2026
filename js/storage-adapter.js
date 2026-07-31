/* ═══════════════════════════════════════════════════════════
   CJStorage — adaptateur de stockage local. Contrat minimal :
     load()        → objet data (ou {} si absent/invalide)
     save(data)     → écrit data
     exportData(d)  → sérialise data en chaîne JSON
     importData(j)  → parse une chaîne (ou objet) JSON importée
     backup()       → snapshot de sécurité horodaté, sans y toucher

   La clé de stockage reste STRICTEMENT 'cj_data', identique à
   l'implémentation historique. Aucune autre source de stockage
   (Supabase, etc.) n'est introduite à cette étape.
═══════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CJStorage = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const STORAGE_KEY = 'cj_data';

  function createLocalStorageAdapter(storageImpl) {
    const ls = storageImpl || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!ls) throw new Error('localStorage indisponible dans cet environnement');

    return {
      // Identique à l'ancien load() : JSON.parse tolérant, {} par défaut.
      load() {
        try {
          return JSON.parse(ls.getItem(STORAGE_KEY) || '{}');
        } catch {
          return {};
        }
      },

      // Identique à l'ancien save().
      save(data) {
        ls.setItem(STORAGE_KEY, JSON.stringify(data));
      },

      // Identique au cœur de l'ancien exportJSON() (sans le téléchargement,
      // qui reste une préoccupation d'UI et non de stockage).
      exportData(data) {
        return JSON.stringify(data, null, 2);
      },

      // Identique au cœur de l'ancien importJSON() (sans la confirmation
      // utilisateur ni le rendu, qui restent une préoccupation d'UI).
      importData(json) {
        return typeof json === 'string' ? JSON.parse(json) : json;
      },

      // Sauvegarde de sécurité : copie l'état courant de cj_data sous une
      // clé horodatée distincte, sans modifier cj_data lui-même.
      // Procédure manuelle équivalente documentée dans ARCHITECTURE.md :
      // exporter via le bouton 💾 avant toute opération risquée.
      backup() {
        const snapshot = ls.getItem(STORAGE_KEY) || '{}';
        const backupKey = `${STORAGE_KEY}_backup_${Date.now()}`;
        ls.setItem(backupKey, snapshot);
        return backupKey;
      }
    };
  }

  return { STORAGE_KEY, createLocalStorageAdapter };
});
