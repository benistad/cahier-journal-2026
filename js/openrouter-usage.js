/* Suivi des dépenses OpenRouter sans exposer la clé API au navigateur. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CJOpenRouterUsage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function finiteAmount(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  function normalizeUsage(payload) {
    if (!payload || payload.configured === false) return { configured: false };
    const usage = finiteAmount(payload.usage);
    if (usage === null) throw new Error('Dépenses OpenRouter invalides');
    const limit = finiteAmount(payload.limit);
    const reportedRemaining = finiteAmount(payload.remaining);
    return {
      configured: true,
      usage,
      usageDaily: finiteAmount(payload.usageDaily) || 0,
      usageWeekly: finiteAmount(payload.usageWeekly) || 0,
      usageMonthly: finiteAmount(payload.usageMonthly) || 0,
      limit,
      remaining: reportedRemaining !== null
        ? reportedRemaining
        : (limit === null ? null : Math.max(0, limit - usage)),
      limitReset: typeof payload.limitReset === 'string' ? payload.limitReset : null,
      updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null
    };
  }

  function formatDollars(value) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4
    }).format(value);
  }

  function displayUsage(usage) {
    const data = normalizeUsage(usage);
    if (!data.configured) return { hidden: true, label: '', title: '' };
    const hasRemaining = data.remaining !== null;
    const label = hasRemaining
      ? `IA : ${formatDollars(data.remaining)} restants`
      : `IA : ${formatDollars(data.usage)} dépensés`;
    const details = [
      `Aujourd’hui : ${formatDollars(data.usageDaily)}`,
      `Ce mois : ${formatDollars(data.usageMonthly)}`,
      `Total de la clé : ${formatDollars(data.usage)}`
    ];
    if (data.limit !== null) details.push(`Plafond : ${formatDollars(data.limit)}`);
    else details.push('Aucun plafond défini sur cette clé');
    return { hidden: false, label, title: `${details.join(' · ')} · Cliquer pour actualiser` };
  }

  function createUsageClient(client) {
    if (!client) throw new Error('Client Supabase requis');
    async function fetchUsage() {
      const response = await client.functions.invoke('openrouter-usage', { body: {} });
      if (response.error) throw response.error;
      return normalizeUsage(response.data);
    }
    return { fetchUsage };
  }

  return { normalizeUsage, formatDollars, displayUsage, createUsageClient };
});
