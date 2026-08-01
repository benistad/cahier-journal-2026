export type OpenRouterKeyUsage = {
  usage: number;
  usage_daily: number;
  usage_weekly: number;
  usage_monthly: number;
  limit: number | null;
  limit_remaining: number | null;
  limit_reset: string | null;
};

function amount(value: unknown, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Réponse OpenRouter invalide');
  }
  return value;
}

export function normalizeKeyUsage(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Réponse OpenRouter invalide');
  const data = value as Record<string, unknown>;
  return {
    usage: amount(data.usage),
    usageDaily: amount(data.usage_daily),
    usageWeekly: amount(data.usage_weekly),
    usageMonthly: amount(data.usage_monthly),
    limit: amount(data.limit, true),
    remaining: amount(data.limit_remaining, true),
    limitReset: typeof data.limit_reset === 'string' ? data.limit_reset : null
  };
}
