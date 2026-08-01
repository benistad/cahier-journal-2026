/* ═══════════════════════════════════════════════════════════
   CJStorage — adaptateur de stockage local. Contrat minimal :
     load()        → objet data (ou {} si absent/invalide)
     save(data)     → écrit data
     exportData(d)  → sérialise data en chaîne JSON
     importData(j)  → parse une chaîne (ou objet) JSON importée
     backup()       → snapshot de sécurité horodaté, sans y toucher

   La clé principale reste 'cj_data'. La première lecture d'une valeur
   historique crée une sauvegarde unique avant migration.
═══════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./journal-schema.js'));
  } else {
    root.CJStorage = factory(root.CJSchema);
  }
})(typeof self !== 'undefined' ? self : this, function (CJSchema) {

  const STORAGE_KEY = 'cj_data';
  const PRE_MIGRATION_BACKUP_KEY = 'cj_data_before_schema_v2';

  function createLocalStorageAdapter(storageImpl) {
    const ls = storageImpl || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!ls) throw new Error('localStorage indisponible dans cet environnement');

    return {
      // Identique à l'ancien load() : JSON.parse tolérant, {} par défaut.
      load() {
        try {
          const raw = ls.getItem(STORAGE_KEY);
          const parsed = JSON.parse(raw || '{}');
          if (raw !== null && CJSchema.isLegacySchema(parsed) && ls.getItem(PRE_MIGRATION_BACKUP_KEY) === null) {
            ls.setItem(PRE_MIGRATION_BACKUP_KEY, raw);
          }
          return CJSchema.migrate(parsed);
        } catch {
          return CJSchema.migrate({});
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
        const parsed = typeof json === 'string' ? JSON.parse(json) : json;
        return CJSchema.migrate(parsed);
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

  return { STORAGE_KEY, PRE_MIGRATION_BACKUP_KEY, createLocalStorageAdapter };
});
