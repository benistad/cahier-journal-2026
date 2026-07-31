const { test } = require('node:test');
const assert = require('node:assert/strict');
const CJData = require('../js/data-core.js');

/* ── weekKey() ── */

test('weekKey() sur un lundi renvoie ce lundi', () => {
  // 2023-01-02 est un lundi
  const key = CJData.weekKey(0, new Date('2023-01-02T12:00:00'));
  assert.equal(key, '2023-01-02');
});

test('weekKey() sur un dimanche renvoie le lundi de la même semaine', () => {
  // 2023-01-08 est un dimanche → lundi attendu : 2023-01-02
  const key = CJData.weekKey(0, new Date('2023-01-08T12:00:00'));
  assert.equal(key, '2023-01-02');
});

test('weekKey() gère le changement d\'année', () => {
  // 2023-01-01 est un dimanche → lundi attendu : 2022-12-26 (année précédente)
  const key = CJData.weekKey(0, new Date('2023-01-01T12:00:00'));
  assert.equal(key, '2022-12-26');
});

/* ── normalizeWeek() / ensureWeek() ── */

test('normalizeWeek() sur une semaine vide crée les 5 jours avec blocks/attachments vides', () => {
  const week = CJData.normalizeWeek(undefined);
  assert.deepEqual(Object.keys(week), CJData.DAYS);
  CJData.DAYS.forEach(d => {
    assert.deepEqual(week[d], { blocks: [], attachments: [] });
  });
});

test('ensureWeek() conserve les 5 jours attendus même si la semaine est partielle', () => {
  const data = { '2026-06-15': { Lundi: { blocks: [{ type: 'subject', tag: 'Rituels', content: 'x' }], attachments: [] } } };
  const week = CJData.ensureWeek(data, '2026-06-15');
  assert.deepEqual(Object.keys(week).sort(), [...CJData.DAYS].sort());
});

test('ensureWeek() ne touche pas aux blocs déjà présents', () => {
  const blocks = [{ type: 'subject', tag: 'Rituels', content: 'contenu original' }];
  const data = { '2026-06-15': { Lundi: { blocks, attachments: [] } } };
  CJData.ensureWeek(data, '2026-06-15');
  assert.deepEqual(data['2026-06-15'].Lundi.blocks, blocks);
});

test('ensureWeek() ne touche pas aux pièces jointes déjà présentes', () => {
  const attachments = [{ name: 'fiche.pdf', url: 'data:application/pdf;base64,AAA', size: '12 Ko' }];
  const data = { '2026-06-15': { Lundi: { blocks: [], attachments } } };
  CJData.ensureWeek(data, '2026-06-15');
  assert.deepEqual(data['2026-06-15'].Lundi.attachments, attachments);
});

test('getDayData() renvoie le bon jour et complète la semaine si besoin', () => {
  const data = {};
  const mardi = CJData.getDayData(data, 'Mardi', '2026-06-15');
  assert.deepEqual(mardi, { blocks: [], attachments: [] });
  assert.deepEqual(Object.keys(data['2026-06-15']).sort(), [...CJData.DAYS].sort());
});

/* ── mergeRemoteIntoLocal() ── */

test('mergeRemoteIntoLocal() donne la priorité à data.json pour les semaines communes', () => {
  const local = { '2026-06-15': { Lundi: { blocks: [{ type: 'subject', tag: 'Local', content: 'x' }], attachments: [] } } };
  const remote = { '2026-06-15': { Lundi: { blocks: [{ type: 'subject', tag: 'Distant', content: 'y' }], attachments: [] } } };
  const merged = CJData.mergeRemoteIntoLocal(local, remote);
  assert.equal(merged['2026-06-15'].Lundi.blocks[0].tag, 'Distant');
});

test('mergeRemoteIntoLocal() conserve les semaines locales absentes de data.json', () => {
  const local = {
    '2026-06-15': { Lundi: { blocks: [{ type: 'subject', tag: 'Distant', content: 'y' }], attachments: [] } },
    '2026-06-22': { Lundi: { blocks: [{ type: 'subject', tag: 'LocalSeulement', content: 'z' }], attachments: [] } }
  };
  const remote = { '2026-06-15': { Lundi: { blocks: [{ type: 'subject', tag: 'Distant', content: 'y' }], attachments: [] } } };
  const merged = CJData.mergeRemoteIntoLocal(local, remote);
  assert.equal(merged['2026-06-22'].Lundi.blocks[0].tag, 'LocalSeulement');
});
