import { createOAuthState } from '../_shared/crypto.ts';
import { authorizationUrl } from '../_shared/google.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { authenticatedUser } from '../_shared/supabase.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Méthode refusée' }, 405);
  try {
    const user = await authenticatedUser(req);
    const state = await createOAuthState(user.id);
    return json(req, { authorizationUrl: authorizationUrl(state) });
  } catch (error) {
    return json(req, { error: safeError(error) }, 401);
  }
});
