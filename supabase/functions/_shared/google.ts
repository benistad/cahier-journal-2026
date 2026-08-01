export const DRIVE_ROOT_FOLDER_ID = '1wfWprf8j8_CegA5Uw573Ar3BRda57Qel';
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret serveur manquant: ${name}`);
  return value;
}

export function oauthRedirectUri() {
  return Deno.env.get('GOOGLE_DRIVE_REDIRECT_URI')
    || `${required('SUPABASE_URL')}/functions/v1/drive-auth-callback`;
}

export function authorizationUrl(state: string) {
  const params = new URLSearchParams({
    client_id: required('GOOGLE_DRIVE_CLIENT_ID'),
    redirect_uri: oauthRedirectUri(),
    response_type: 'code',
    scope: DRIVE_READONLY_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: required('GOOGLE_DRIVE_CLIENT_ID'),
      client_secret: required('GOOGLE_DRIVE_CLIENT_SECRET'),
      redirect_uri: oauthRedirectUri(),
      grant_type: 'authorization_code'
    })
  });
  const data = await response.json();
  if (!response.ok || !data.refresh_token) throw new Error('Google n’a pas fourni de jeton de renouvellement');
  return data as { access_token: string; refresh_token: string; expires_in: number; scope: string };
}

export async function refreshAccessToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: required('GOOGLE_DRIVE_CLIENT_ID'),
      client_secret: required('GOOGLE_DRIVE_CLIENT_SECRET'),
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Renouvellement Google Drive impossible');
  return data.access_token as string;
}

export async function googleJson(accessToken: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google Drive a refusé la lecture (${response.status})`);
  return response.json();
}

export async function googleText(accessToken: string, fileId: string) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text%2Fplain`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) return '';
  return (await response.text()).slice(0, 50000);
}
