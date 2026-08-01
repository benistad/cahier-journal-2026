import { normalizeKeyUsage } from './openrouter.ts';

Deno.test('normalise les dépenses renvoyées par la clé OpenRouter', () => {
  const actual = normalizeKeyUsage({
    usage: 2.5, usage_daily: 0.1, usage_weekly: 0.8, usage_monthly: 2,
    limit: 10, limit_remaining: 7.5, limit_reset: 'monthly'
  });
  const expected = {
    usage: 2.5, usageDaily: 0.1, usageWeekly: 0.8, usageMonthly: 2,
    limit: 10, remaining: 7.5, limitReset: 'monthly'
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('normalisation incorrecte');
});

Deno.test('refuse les montants OpenRouter invalides', () => {
  let rejected = false;
  try {
    normalizeKeyUsage({
      usage: -1, usage_daily: 0, usage_weekly: 0, usage_monthly: 0,
      limit: null, limit_remaining: null
    });
  } catch (_error) {
    rejected = true;
  }
  if (!rejected) throw new Error('montant négatif accepté');
});
