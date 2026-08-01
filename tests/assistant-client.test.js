const { test } = require('node:test');
const assert = require('node:assert/strict');
const CJSchema = require('../js/journal-schema.js');
const {
  normalizeProposal, previewItems, applyProposal, createAssistantClient
} = require('../js/assistant-client.js');

function validProposal() {
  return {
    summary: 'Deux activités à ajouter.',
    clarificationNeeded: false,
    clarificationQuestion: '',
    operations: [{
      type: 'addBlock', weekKey: '2026-06-08', day: 'Lundi',
      block: {
        type: 'subject', tag: 'Français', content: 'Conjuguer au présent.', time: '09:00',
        documents: [{
          provider: 'google_drive', fileId: 'pdf-1', title: 'Le présent.pdf',
          url: 'https://drive.google.com/file/d/pdf-1/view', mimeType: 'application/pdf', role: 'lesson'
        }]
      }
    }]
  };
}

test('valide et prépare un aperçu sans muter la proposition', () => {
  const proposal = validProposal();
  const before = structuredClone(proposal);
  const preview = previewItems(proposal);
  assert.equal(preview[0].tag, 'Français');
  assert.equal(preview[0].documents[0].fileId, 'pdf-1');
  assert.deepEqual(proposal, before);
});

test('rejette toute suppression ou modification proposée par le serveur IA', () => {
  const proposal = validProposal();
  proposal.operations[0].type = 'deleteBlock';
  assert.throws(() => normalizeProposal(proposal), /uniquement ajouter/);
});

test('rejette les champs et documents non normalisés', () => {
  const proposal = validProposal();
  proposal.operations[0].block.documents[0].secret = 'interdit';
  assert.throws(() => normalizeProposal(proposal), /inattendu/);
});

test('applique la proposition sur une copie et en mode atomique', () => {
  const input = CJSchema.migrate({
    '2026-06-08': { Lundi: { blocks: [], attachments: [] } }
  });
  const before = structuredClone(input);
  const result = applyProposal(input, validProposal(), { idFactory: () => 'assistant-id' });
  assert.equal(result.errors.length, 0);
  assert.equal(result.data.weeks['2026-06-08'].Lundi.blocks[0].id, 'assistant-id');
  assert.deepEqual(input, before);
});

test('une opération invalide annule tout le lot', () => {
  const proposal = validProposal();
  proposal.operations.push(structuredClone(proposal.operations[0]));
  const input = CJSchema.migrate({ '2026-06-08': { Lundi: { blocks: [], attachments: [] } } });
  const result = applyProposal(input, proposal, { idFactory: () => 'duplicate-id' });
  assert.ok(result.errors.length > 0);
  assert.equal(result.data.weeks['2026-06-08'].Lundi.blocks.length, 0);
});

test('le client ne transmet que le récit et le contexte à la fonction serveur', async () => {
  const calls = [];
  const client = {
    functions: {
      invoke: async (name, options) => {
        calls.push([name, options]);
        return { data: { proposal: validProposal(), candidateCount: 1, model: 'openai/gpt-5.6-luna' }, error: null };
      }
    }
  };
  const input = { narrative: 'Nous avons travaillé le présent.', weekKey: '2026-06-08', day: 'Lundi' };
  const response = await createAssistantClient(client).propose(input);
  assert.equal(response.candidateCount, 1);
  assert.deepEqual(calls, [['assistant-propose', { body: input }]]);
});
