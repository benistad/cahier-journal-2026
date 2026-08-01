import { createClient } from 'npm:@supabase/supabase-js@2';

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret serveur manquant: ${name}`);
  return value;
}

function firstNamedKey(name: 'SUPABASE_PUBLISHABLE_KEYS' | 'SUPABASE_SECRET_KEYS') {
  const raw = Deno.env.get(name);
  if (!raw) return null;
  const values = Object.values(JSON.parse(raw));
  return typeof values[0] === 'string' ? values[0] : null;
}

export function serviceKey() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || firstNamedKey('SUPABASE_SECRET_KEYS') || required('SUPABASE_SERVICE_ROLE_KEY');
}

export function publishableKey() {
  return Deno.env.get('SUPABASE_ANON_KEY') || firstNamedKey('SUPABASE_PUBLISHABLE_KEYS') || required('SUPABASE_ANON_KEY');
}

export function adminClient() {
  return createClient(required('SUPABASE_URL'), serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new Error('Session requise');
  const client = createClient(required('SUPABASE_URL'), publishableKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Session invalide');
  return data.user;
}

export function appSiteUrl() {
  return Deno.env.get('APP_SITE_URL') || 'https://benistad.github.io/cahier-journal-2026/';
}
