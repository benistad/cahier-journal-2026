/* Client de proposition IA : validation stricte, aperçu, puis opérations locales atomiques. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./journal-schema.js'), require('./journal-operations.js'));
  } else {
    root.CJAssistant = factory(root.CJSchema, root.CJOperations);
  }
})(typeof self !== 'undefined' ? self : this, function (CJSchema, CJOperations) {
  const ASSISTANT_BREAK_LABELS = ['RECREATION', 'PAUSE MERIDIENNE', 'FIN DE JOURNÉE'];

  function exactKeys(value, allowed) {
    return Object.keys(value).every(key => allowed.includes(key));
  }

  function validateAssistantDocument(document) {
    const error = CJOperations.validateDocument(document);
    if (error) return error;
    const fields = ['provider', 'fileId', 'title', 'url', 'mimeType', 'role'];
    if (!exactKeys(document, fields)) return 'Champ de document inattendu';
    if (document.provider !== 'google_drive') return 'Fournisseur de document invalide';
    return null;
  }

  function validateAssistantOperation(operation) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return 'Opération invalide';
    if (!exactKeys(operation, ['type', 'weekKey', 'day', 'block'])) return 'Champ d’opération inattendu';
    if (operation.type !== 'addBlock') return 'L’assistant peut uniquement ajouter une activité';
    if (typeof operation.weekKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(operation.weekKey)) return 'Semaine invalide';
    if (!CJSchema.DAYS.includes(operation.day)) return 'Jour invalide';
    const block = operation.block;
    if (!block || typeof block !== 'object' || Array.isArray(block)) return 'Bloc invalide';
    const allowedFields = block.type === 'break'
      ? ['type', 'label', 'time']
      : ['type', 'tag', 'content', 'time', 'documents'];
    if (!exactKeys(block, allowedFields)) return 'Champ de bloc inattendu';
    if (!['subject', 'break'].includes(block.type)) return 'Type de bloc IA invalide';
    if (block.type === 'break' && !ASSISTANT_BREAK_LABELS.includes(block.label)) return 'Pause IA invalide';
    const error = CJOperations.validateBlock(block, false);
    if (error) return error;
    for (const document of block.documents || []) {
      const documentError = validateAssistantDocument(document);
      if (documentError) return documentError;
    }
    return null;
  }

  function normalizeProposal(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Proposition manquante');
    if (!exactKeys(value, ['summary', 'clarificationNeeded', 'clarificationQuestion', 'operations'])) {
      throw new Error('Proposition inattendue');
    }
    if (typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 500) {
      throw new Error('Résumé de proposition invalide');
    }
    if (typeof value.clarificationNeeded !== 'boolean') throw new Error('Clarification invalide');
    if (typeof value.clarificationQuestion !== 'string' || value.clarificationQuestion.length > 500) {
      throw new Error('Question invalide');
    }
    if (!Array.isArray(value.operations) || value.operations.length > 24) throw new Error('Opérations invalides');
    value.operations.forEach(operation => {
      const error = validateAssistantOperation(operation);
      if (error) throw new Error(error);
    });
    if (value.clarificationNeeded && value.operations.length) throw new Error('Clarification non vide');
    if (!value.clarificationNeeded && !value.operations.length) throw new Error('Proposition vide');
    if (value.clarificationNeeded && !value.clarificationQuestion.trim()) throw new Error('Question manquante');
    return CJSchema.clone(value);
  }

  function previewItems(proposal) {
    return normalizeProposal(proposal).operations.map(operation => ({
      weekKey: operation.weekKey,
      day: operation.day,
      type: operation.block.type,
      tag: operation.block.type === 'break' ? operation.block.label : operation.block.tag,
      content: operation.block.type === 'break' ? '' : operation.block.content,
      time: operation.block.time || '',
      documents: CJSchema.clone(operation.block.documents || [])
    }));
  }

  function applyProposal(input, proposal, options = {}) {
    const normalized = normalizeProposal(proposal);
    if (normalized.clarificationNeeded) {
      return { data: CJSchema.migrate(input), acceptedOperations: [], rejectedOperations: [], errors: [] };
    }
    return CJOperations.applyOperations(input, normalized.operations, {
      atomic: true,
      idFactory: options.idFactory
    });
  }

  function createAssistantClient(client) {
    if (!client) throw new Error('Client Supabase requis');
    async function propose(input) {
      const response = await client.functions.invoke('assistant-propose', { body: input });
      if (response.error) throw response.error;
      if (!response.data || !response.data.proposal) throw new Error('Réponse assistant manquante');
      return {
        proposal: normalizeProposal(response.data.proposal),
        candidateCount: Number(response.data.candidateCount) || 0,
        model: response.data.model || '',
        usage: response.data.usage || null
      };
    }
    return { propose };
  }

  return {
    validateAssistantDocument,
    validateAssistantOperation,
    normalizeProposal,
    previewItems,
    applyProposal,
    createAssistantClient
  };
});
