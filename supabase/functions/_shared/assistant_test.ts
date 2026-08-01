import {
  buildOperations, modelMessages, selectDriveCandidates, validateModelProposal
} from './assistant.ts';

const files = [
  {
    file_id: 'present-docx', title: 'Le présent — leçon CM1-CM2.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    web_view_link: 'https://drive.test/docx', path: ['CM1-CM2', '1 — Français', 'Le présent'], subject: 'Français', notion: 'Le présent', sequence: null,
    role: 'lesson', content_excerpt: 'Conjugaison au présent.'
  },
  {
    file_id: 'present-pdf', title: 'Le présent — leçon CM1-CM2 — rendu fidèle.pdf', mime_type: 'application/pdf',
    web_view_link: 'https://drive.test/pdf', path: ['CM1-CM2', '1 — Français', 'Le présent'], subject: 'Français', notion: 'Le présent', sequence: null,
    role: 'lesson', content_excerpt: ''
  },
  {
    file_id: 'maths', title: 'Séquence — Multiplier deux nombres entiers', mime_type: 'application/vnd.google-apps.document',
    web_view_link: 'https://drive.test/maths', path: ['CM1-CM2', '2 — Maths', 'Multiplier deux nombres entiers'], subject: 'Maths', notion: 'Multiplier deux nombres entiers', sequence: null,
    role: 'sequence', content_excerpt: ''
  }
];

Deno.test('sélectionne au plus cinq candidats et préfère le PDF final', () => {
  const selected = selectDriveCandidates(files, 'Nous avons travaillé la conjugaison au présent', 5);
  if (selected.length !== 1 || selected[0].file_id !== 'present-pdf') throw new Error('mauvaise version sélectionnée');
});

Deno.test('ne transmet au modèle que les candidats retenus et tronqués', () => {
  const candidate = { ...files[0], content_excerpt: 'x'.repeat(4000) };
  const messages = modelMessages('Le présent', { weekKey: '2026-06-08', day: 'Lundi' }, [candidate]);
  const payload = JSON.parse(messages[1].content);
  if (payload.untrustedDriveCandidates.length !== 1) throw new Error('candidats invalides');
  if (payload.untrustedDriveCandidates[0].excerpt.length !== 1600) throw new Error('extrait non tronqué');
});

Deno.test('rejette tout document inventé par le modèle', () => {
  let rejected = false;
  try {
    validateModelProposal({
      summary: 'Résumé', clarificationNeeded: false, clarificationQuestion: '',
      activities: [{ tag: 'Français', content: 'Présent', time: '', documentFileIds: ['invente'] }]
    }, new Set(['present-pdf']));
  } catch (_error) {
    rejected = true;
  }
  if (!rejected) throw new Error('document inventé accepté');
});

Deno.test('construit seulement des opérations sans les appliquer', () => {
  const proposal = validateModelProposal({
    summary: 'Une activité', clarificationNeeded: false, clarificationQuestion: '',
    activities: [{ tag: 'Français', content: 'Le présent', time: '09:00', documentFileIds: ['present-pdf'] }]
  }, new Set(['present-pdf']));
  const operations = buildOperations(proposal, { weekKey: '2026-06-08', day: 'Lundi' }, [files[1]]);
  if (operations.length !== 1 || operations[0].type !== 'addBlock') throw new Error('opération invalide');
  if (operations[0].block.documents[0]?.fileId !== 'present-pdf') throw new Error('document absent');
});
