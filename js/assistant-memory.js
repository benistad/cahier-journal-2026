/* Mémoire durable et explicite des habitudes pédagogiques de l’enseignant. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CJAssistantMemory = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const COMMAND = /^\s*(?:retiens(?:\s+bien)?\s+(?:que\s+)?|m[ée]morise\s+(?:que\s+)?|souviens[\s-]*toi\s+(?:que\s+)?|[àa]\s+partir\s+de\s+maintenant[\s,:-]*)/i;

  function normalizeRule(value) {
    if (typeof value !== 'string') throw new Error('Règle invalide');
    const rule = value.replace(/\s+/g, ' ').trim();
    if (rule.length < 3 || rule.length > 500) throw new Error('La règle doit contenir entre 3 et 500 caractères');
    return rule;
  }

  function isMemoryCommand(value) {
    return typeof value === 'string' && COMMAND.test(value);
  }

  function extractRule(value) {
    if (!isMemoryCommand(value)) return null;
    return normalizeRule(value.replace(COMMAND, ''));
  }

  function normalizeRow(row) {
    if (!row || (!Number.isInteger(Number(row.id)) && typeof row.id !== 'string')) throw new Error('Règle distante invalide');
    return {
      id: String(row.id),
      rule: normalizeRule(row.rule),
      createdAt: typeof row.created_at === 'string' ? row.created_at : null
    };
  }

  function createMemoryClient(client) {
    if (!client) throw new Error('Client Supabase requis');

    async function list() {
      const { data, error } = await client.from('assistant_preferences')
        .select('id,rule,created_at').order('created_at', { ascending: true }).limit(30);
      if (error) throw error;
      return (data || []).map(normalizeRow);
    }

    async function add(rule, ownerId) {
      if (typeof ownerId !== 'string' || !ownerId) throw new Error('Utilisateur requis');
      const normalized = normalizeRule(rule);
      const { data, error } = await client.from('assistant_preferences')
        .insert({ owner_id: ownerId, rule: normalized })
        .select('id,rule,created_at').single();
      if (error) throw error;
      return normalizeRow(data);
    }

    async function remove(id, ownerId) {
      if (typeof id !== 'string' || !id || typeof ownerId !== 'string' || !ownerId) throw new Error('Règle invalide');
      const { error } = await client.from('assistant_preferences')
        .delete().eq('id', id).eq('owner_id', ownerId);
      if (error) throw error;
    }

    return { list, add, remove };
  }

  return { normalizeRule, isMemoryCommand, extractRule, normalizeRow, createMemoryClient };
});
