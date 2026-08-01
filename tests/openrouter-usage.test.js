const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeUsage, displayUsage, createUsageClient
} = require('../js/openrouter-usage.js');

test('normalise les dépenses et calcule le restant si nécessaire', () => {
  assert.deepEqual(normalizeUsage({ configured: true, usage: 1.25, limit: 10 }), {
    configured: true,
    usage: 1.25,
    usageDaily: 0,
    usageWeekly: 0,
    usageMonthly: 0,
    limit: 10,
    remaining: 8.75,
    limitReset: null,
    updatedAt: null
  });
});

test('affiche le restant avec plafond et les dépenses sans plafond', () => {
  const limited = displayUsage({ configured: true, usage: 2, remaining: 8, limit: 10 });
  assert.match(limited.label, /8,00.*restants/);
  assert.match(limited.title, /Total de la clé/);

  const unlimited = displayUsage({ configured: true, usage: 2.5, limit: null, remaining: null });
  assert.match(unlimited.label, /2,50.*dépensés/);
  assert.match(unlimited.title, /Aucun plafond/);
});

test('masque la jauge tant que la clé serveur manque', () => {
  assert.deepEqual(displayUsage({ configured: false }), { hidden: true, label: '', title: '' });
});

test('le client appelle uniquement la fonction Supabase', async () => {
  const calls = [];
  const client = {
    functions: {
      invoke: async (name, options) => {
        calls.push([name, options]);
        return { data: { configured: true, usage: 0.12 }, error: null };
      }
    }
  };
  const usage = await createUsageClient(client).fetchUsage();
  assert.equal(usage.usage, 0.12);
  assert.deepEqual(calls, [['openrouter-usage', { body: {} }]]);
});

test('refuse une dépense invalide', () => {
  assert.throws(() => normalizeUsage({ configured: true, usage: 'inconnue' }), /invalides/);
});
