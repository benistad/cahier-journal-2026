/* Schéma versionné et migration pure des données du cahier journal. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CJSchema = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const SCHEMA_VERSION = 2;
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const DOCUMENT_ROLES = [
    'sequence', 'teacher_sheet', 'student_sheet', 'slideshow', 'lesson',
    'exercise', 'assessment', 'correction', 'other'
  ];

  function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function stableHash(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36).padStart(7, '0');
  }

  function legacyBlockId(weekKey, day, block, occurrence) {
    const identity = JSON.stringify([
      weekKey, day, block.type || 'subject', block.tag || '', block.time || '',
      block.content || '', block.label || '', occurrence
    ]);
    return `legacy-${stableHash(identity)}`;
  }

  function currentWeeks(input) {
    return input && input.schemaVersion === SCHEMA_VERSION && input.weeks && typeof input.weeks === 'object'
      ? input.weeks
      : input;
  }

  function isCurrentSchema(input) {
    return Boolean(input && input.schemaVersion === SCHEMA_VERSION && input.weeks && typeof input.weeks === 'object');
  }

  function isLegacySchema(input) {
    return Boolean(input && typeof input === 'object' && !Array.isArray(input) && !isCurrentSchema(input));
  }

  function migrate(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    if (isCurrentSchema(source)) return clone(source);

    const weeks = {};
    Object.keys(source).forEach(weekKey => {
      const sourceWeek = source[weekKey];
      if (!sourceWeek || typeof sourceWeek !== 'object' || Array.isArray(sourceWeek)) return;
      const week = clone(sourceWeek);
      Object.keys(week).forEach(day => {
        const dayData = week[day];
        if (!dayData || typeof dayData !== 'object' || Array.isArray(dayData)) return;
        const seen = new Map();
        dayData.blocks = Array.isArray(dayData.blocks) ? dayData.blocks.map(sourceBlock => {
          const block = sourceBlock && typeof sourceBlock === 'object' ? clone(sourceBlock) : {};
          const signature = JSON.stringify([
            block.type || 'subject', block.tag || '', block.time || '',
            block.content || '', block.label || ''
          ]);
          const occurrence = seen.get(signature) || 0;
          seen.set(signature, occurrence + 1);
          if (!block.id) block.id = legacyBlockId(weekKey, day, block, occurrence);
          if (block.type !== 'break' && !Array.isArray(block.documents)) block.documents = [];
          return block;
        }) : [];
        if (!Array.isArray(dayData.attachments)) dayData.attachments = [];
      });
      weeks[weekKey] = week;
    });
    return { schemaVersion: SCHEMA_VERSION, weeks };
  }

  function createId(idFactory) {
    if (idFactory) return idFactory();
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    throw new Error('crypto.randomUUID indisponible : fournissez idFactory');
  }

  return {
    SCHEMA_VERSION,
    DAYS,
    DOCUMENT_ROLES,
    clone,
    currentWeeks,
    isCurrentSchema,
    isLegacySchema,
    migrate,
    createId,
    legacyBlockId
  };
});
