import { encryptToken, verifyOAuthState } from '../_shared/crypto.ts';
import { DRIVE_READONLY_SCOPE, exchangeCode, googleJson } from '../_shared/google.ts';
import { adminClient, appSiteUrl } from '../_shared/supabase.ts';

function redirect(status: 'connected' | 'error') {
  const url = new URL(appSiteUrl());
  url.searchParams.set('drive', status);
  return Response.redirect(url, 302);
}

Deno.serve(async req => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || url.searchParams.get('error')) return redirect('error');
    const payload = await verifyOAuthState(state);
    const tokens = await exchangeCode(code);
    const profile = await googleJson(tokens.access_token, 'about', { fields: 'user(emailAddress)' });
    const googleEmail = profile.user?.emailAddress || null;
    const admin = adminClient();
    const { error: connectionError } = await admin.from('drive_connections').upsert({
      owner_id: payload.sub,
      refresh_token_ciphertext: await encryptToken(tokens.refresh_token),
      google_email: googleEmail,
      scopes: (tokens.scope || DRIVE_READONLY_SCOPE).split(' '),
      change_page_token: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (connectionError) throw connectionError;
    const { error: statusError } = await admin.from('drive_connection_status').upsert({
      owner_id: payload.sub,
      connected: true,
      google_email: googleEmail,
      last_error: null,
      updated_at: new Date().toISOString()
    });
    if (statusError) throw statusError;
    return redirect('connected');
  } catch (error) {
    console.error('Drive OAuth callback failed', error instanceof Error ? error.message : 'unknown');
    return redirect('error');
  }
});
