import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { normalizeKeyUsage } from '../_shared/openrouter.ts';
import { authenticatedUser } from '../_shared/supabase.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Méthode refusée' }, 405);
  try {
    await authenticatedUser(req);
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) return json(req, { configured: false });

    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`OpenRouter a refusé la lecture (${response.status})`);
    const payload = await response.json();
    const usage = normalizeKeyUsage(payload?.data);
    return json(req, { configured: true, ...usage, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('openrouter-usage', safeError(error));
    return json(req, { error: 'Dépenses IA momentanément indisponibles' }, 502);
  }
});
