/* Opérations métier pures, validées et applicables atomiquement. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./journal-schema.js'));
  } else {
    root.CJOperations = factory(root.CJSchema);
  }
})(typeof self !== 'undefined' ? self : this, function (CJSchema) {
  const OPERATION_TYPES = [
    'addBlock', 'updateBlock', 'deleteBlock', 'moveBlock',
    'attachDocument', 'detachDocument', 'attachFile', 'detachFile'
  ];

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function validateDocument(document) {
    if (!isPlainObject(document)) return 'Le document doit être un objet';
    const required = ['provider', 'fileId', 'title', 'url', 'mimeType', 'role'];
    const missing = required.find(field => typeof document[field] !== 'string' || !document[field].trim());
    if (missing) return `Champ de document invalide : ${missing}`;
    if (!CJSchema.DOCUMENT_ROLES.includes(document.role)) return `Rôle de document invalide : ${document.role}`;
    return null;
  }

  function validateAttachment(attachment) {
    if (!isPlainObject(attachment)) return 'La pièce jointe doit être un objet';
    const required = ['id', 'name', 'url'];
    const missing = required.find(field => typeof attachment[field] !== 'string' || !attachment[field].trim());
    if (missing) return `Champ de pièce jointe invalide : ${missing}`;
    if (!attachment.url.startsWith('data:') && !/^https:\/\//i.test(attachment.url)) return 'Adresse de pièce jointe invalide';
    return null;
  }

  function validateBlock(block, requireId) {
    if (!isPlainObject(block)) return 'Le bloc doit être un objet';
    if (requireId && (typeof block.id !== 'string' || !block.id)) return 'Identifiant de bloc manquant';
    if (!['subject', 'break'].includes(block.type)) return 'Type de bloc invalide';
    if (block.type === 'break') {
      if (typeof block.label !== 'string' || !block.label.trim()) return 'Libellé de pause manquant';
      return null;
    }
    if (typeof block.tag !== 'string' || !block.tag.trim()) return 'Matière du bloc manquante';
    if (typeof block.content !== 'string') return 'Contenu du bloc invalide';
    if (!Array.isArray(block.documents)) return 'Le tableau documents est manquant';
    for (const document of block.documents) {
      const error = validateDocument(document);
      if (error) return error;
    }
    if (block.attachments !== undefined) {
      if (!Array.isArray(block.attachments)) return 'Le tableau attachments est invalide';
      for (const attachment of block.attachments) {
        const error = validateAttachment(attachment);
        if (error) return error;
      }
    }
    return null;
  }

  function locate(state, operation) {
    if (typeof operation.weekKey !== 'string' || !operation.weekKey) return { error: 'Semaine manquante' };
    if (!CJSchema.DAYS.includes(operation.day)) return { error: 'Jour invalide' };
    const week = state.weeks[operation.weekKey];
    if (!week) return { error: 'Semaine introuvable' };
    const day = week[operation.day];
    if (!day || !Array.isArray(day.blocks)) return { error: 'Jour introuvable' };
    return { week, day };
  }

  function applyOne(state, operation, idFactory) {
    if (!isPlainObject(operation) || !OPERATION_TYPES.includes(operation.type)) return 'Type d’opération invalide';
    const location = locate(state, operation);
    if (location.error) return location.error;
    const blocks = location.day.blocks;

    if (operation.type === 'addBlock') {
      const block = CJSchema.clone(operation.block);
      if (!block.id) block.id = CJSchema.createId(idFactory);
      if (block.type === 'subject' && block.documents === undefined) block.documents = [];
      if (block.type === 'subject' && block.attachments === undefined) block.attachments = [];
      const error = validateBlock(block, true);
      if (error) return error;
      if (blocks.some(item => item.id === block.id)) return 'Identifiant de bloc déjà utilisé';
      const index = operation.index === undefined ? blocks.length : operation.index;
      if (!Number.isInteger(index) || index < 0 || index > blocks.length) return 'Position d’ajout invalide';
      blocks.splice(index, 0, block);
      return null;
    }

    const index = blocks.findIndex(block => block.id === operation.blockId);
    if (index < 0) return 'Bloc introuvable';
    const current = blocks[index];

    if (operation.type === 'deleteBlock') {
      blocks.splice(index, 1);
      return null;
    }
    if (operation.type === 'moveBlock') {
      if (!Number.isInteger(operation.toIndex) || operation.toIndex < 0 || operation.toIndex >= blocks.length) return 'Position de déplacement invalide';
      const moved = blocks.splice(index, 1)[0];
      blocks.splice(operation.toIndex, 0, moved);
      return null;
    }
    if (operation.type === 'updateBlock') {
      if (!isPlainObject(operation.changes)) return 'Modifications de bloc invalides';
      const forbidden = Object.keys(operation.changes).find(key => !['tag', 'content', 'time', 'label'].includes(key));
      if (forbidden) return `Champ de modification interdit : ${forbidden}`;
      const updated = Object.assign({}, current, CJSchema.clone(operation.changes), { id: current.id, type: current.type });
      const error = validateBlock(updated, true);
      if (error) return error;
      blocks[index] = updated;
      return null;
    }
    if (current.type === 'break') return 'Une pause ne peut pas recevoir de document ou de fichier';

    if (operation.type === 'attachFile') {
      const attachment = CJSchema.clone(operation.attachment);
      if (!attachment.id) attachment.id = CJSchema.createId(idFactory);
      const error = validateAttachment(attachment);
      if (error) return error;
      if (!Array.isArray(current.attachments)) current.attachments = [];
      if (current.attachments.some(item => item.id === attachment.id)) return 'Pièce jointe déjà associée';
      current.attachments.push(attachment);
      return null;
    }
    if (operation.type === 'detachFile') {
      if (typeof operation.attachmentId !== 'string' || !operation.attachmentId) return 'Référence de pièce jointe invalide';
      if (!Array.isArray(current.attachments)) current.attachments = [];
      const attachmentIndex = current.attachments.findIndex(item => item.id === operation.attachmentId);
      if (attachmentIndex < 0) return 'Pièce jointe introuvable';
      current.attachments.splice(attachmentIndex, 1);
      return null;
    }

    if (operation.type === 'attachDocument') {
      const document = CJSchema.clone(operation.document);
      const error = validateDocument(document);
      if (error) return error;
      if (current.documents.some(item => item.provider === document.provider && item.fileId === document.fileId)) {
        return 'Document déjà associé';
      }
      current.documents.push(document);
      return null;
    }
    if (typeof operation.provider !== 'string' || typeof operation.fileId !== 'string') return 'Référence de document invalide';
    const documentIndex = current.documents.findIndex(item => item.provider === operation.provider && item.fileId === operation.fileId);
    if (documentIndex < 0) return 'Document associé introuvable';
    current.documents.splice(documentIndex, 1);
    return null;
  }

  function applyOperations(input, operations, options) {
    const config = options || {};
    const original = CJSchema.migrate(input);
    const state = CJSchema.clone(original);
    const list = Array.isArray(operations) ? operations : [];
    const acceptedOperations = [];
    const rejectedOperations = [];
    const errors = [];

    list.forEach((operation, index) => {
      const error = applyOne(state, operation, config.idFactory);
      if (error) {
        rejectedOperations.push(operation);
        errors.push({ index, message: error });
      } else {
        acceptedOperations.push(operation);
      }
    });

    if (config.atomic && rejectedOperations.length) {
      return {
        data: original,
        acceptedOperations: [],
        rejectedOperations: list.slice(),
        errors: errors.concat({ index: null, message: 'Lot atomique annulé' })
      };
    }
    return { data: state, acceptedOperations, rejectedOperations, errors };
  }

  return { OPERATION_TYPES, validateDocument, validateAttachment, validateBlock, applyOperations };
});
