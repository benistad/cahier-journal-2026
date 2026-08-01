import { classifyRole, deriveHierarchy } from '../_shared/catalog.ts';
import { decryptToken } from '../_shared/crypto.ts';
import {
  DRIVE_ROOT_FOLDER_ID, FOLDER_MIME, googleJson, googleText, refreshAccessToken
} from '../_shared/google.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { adminClient, authenticatedUser } from '../_shared/supabase.ts';

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
  parents?: string[];
  trashed?: boolean;
};

const FILE_FIELDS = 'id,name,mimeType,webViewLink,modifiedTime,size,md5Checksum,parents,trashed';

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listChildren(accessToken: string, folderId: string) {
  const files: DriveFile[] = [];
  let pageToken = '';
  do {
    const response = await googleJson(accessToken, 'files', {
      q: `'${escapeDriveQuery(folderId)}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: '1000',
      spaces: 'drive',
      orderBy: 'folder,name',
      ...(pageToken ? { pageToken } : {})
    });
    files.push(...(response.files || []));
    pageToken = response.nextPageToken || '';
  } while (pageToken);
  return files;
}

async function getStartPageToken(accessToken: string) {
  const response = await googleJson(accessToken, 'changes/startPageToken', {});
  if (!response.startPageToken) throw new Error('Google Drive n’a pas fourni de jeton de synchronisation');
  return response.startPageToken as string;
}

async function crawlRoot(accessToken: string) {
  const documents: Array<DriveFile & { path: string[] }> = [];
  const root = await googleJson(accessToken, `files/${DRIVE_ROOT_FOLDER_ID}`, { fields: 'id,name,mimeType' });
  if (root.mimeType !== FOLDER_MIME) throw new Error('Le dossier Drive autorisé est introuvable');

  async function visit(folderId: string, path: string[]) {
    const children = await listChildren(accessToken, folderId);
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) await visit(child.id, [...path, child.name]);
      else documents.push({ ...child, path });
    }
  }

  await visit(DRIVE_ROOT_FOLDER_ID, [root.name]);
  return documents;
}

async function contentExcerpt(accessToken: string, file: DriveFile) {
  if (file.mimeType !== 'application/vnd.google-apps.document') return '';
  return googleText(accessToken, file.id);
}

async function catalogRow(accessToken: string, ownerId: string, file: DriveFile & { path: string[] }) {
  const hierarchy = deriveHierarchy(file.path);
  return {
    owner_id: ownerId,
    file_id: file.id,
    title: file.name,
    mime_type: file.mimeType,
    web_view_link: file.webViewLink || `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`,
    modified_time: file.modifiedTime || null,
    size_bytes: file.size ? Number(file.size) : null,
    md5_checksum: file.md5Checksum || null,
    parent_ids: file.parents || [],
    path: file.path,
    subject: hierarchy.subject,
    notion: hierarchy.notion,
    sequence: hierarchy.sequence,
    role: classifyRole(file.name, file.mimeType),
    content_excerpt: await contentExcerpt(accessToken, file),
    indexed_at: new Date().toISOString()
  };
}

async function fullSync(accessToken: string, ownerId: string, admin: ReturnType<typeof adminClient>) {
  const nextToken = await getStartPageToken(accessToken);
  const files = await crawlRoot(accessToken);
  const rows = [];
  for (const file of files) rows.push(await catalogRow(accessToken, ownerId, file));
  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await admin.from('drive_files').upsert(rows.slice(index, index + 100));
    if (error) throw error;
  }
  const currentIds = new Set(rows.map(row => row.file_id));
  const { data: existing, error: existingError } = await admin
    .from('drive_files').select('file_id').eq('owner_id', ownerId);
  if (existingError) throw existingError;
  const staleIds = (existing || []).map(row => row.file_id).filter(id => !currentIds.has(id));
  for (let index = 0; index < staleIds.length; index += 100) {
    const { error } = await admin.from('drive_files').delete()
      .eq('owner_id', ownerId).in('file_id', staleIds.slice(index, index + 100));
    if (error) throw error;
  }
  return { count: rows.length, nextToken };
}

async function pathInsideRoot(accessToken: string, file: DriveFile) {
  const path: string[] = [];
  const visited = new Set<string>();
  let parentId = file.parents?.[0] || '';
  while (parentId && !visited.has(parentId)) {
    if (parentId === DRIVE_ROOT_FOLDER_ID) {
      const root = await googleJson(accessToken, `files/${DRIVE_ROOT_FOLDER_ID}`, { fields: 'name' });
      return [root.name, ...path];
    }
    visited.add(parentId);
    const parent = await googleJson(accessToken, `files/${parentId}`, { fields: 'id,name,mimeType,parents,trashed' });
    if (parent.trashed) return null;
    path.unshift(parent.name);
    parentId = parent.parents?.[0] || '';
  }
  return null;
}

async function incrementalSync(
  accessToken: string, ownerId: string, savedToken: string, admin: ReturnType<typeof adminClient>
) {
  let pageToken = savedToken;
  let nextToken = savedToken;
  const changes: Array<{ fileId: string; removed?: boolean; file?: DriveFile }> = [];
  try {
    do {
      const response = await googleJson(accessToken, 'changes', {
        pageToken,
        spaces: 'drive',
        includeRemoved: 'true',
        fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`
      });
      changes.push(...(response.changes || []));
      pageToken = response.nextPageToken || '';
      if (response.newStartPageToken) nextToken = response.newStartPageToken;
    } while (pageToken);
  } catch (error) {
    if (String(error).includes('(410)')) return fullSync(accessToken, ownerId, admin);
    throw error;
  }

  if (changes.some(change => change.file?.mimeType === FOLDER_MIME)) return fullSync(accessToken, ownerId, admin);
  let touched = 0;
  for (const change of changes) {
    if (change.removed || !change.file || change.file.trashed) {
      const { error } = await admin.from('drive_files').delete().eq('owner_id', ownerId).eq('file_id', change.fileId);
      if (error) throw error;
      continue;
    }
    const path = await pathInsideRoot(accessToken, change.file);
    if (!path) {
      const { error } = await admin.from('drive_files').delete().eq('owner_id', ownerId).eq('file_id', change.fileId);
      if (error) throw error;
      continue;
    }
    const { error } = await admin.from('drive_files').upsert(await catalogRow(
      accessToken, ownerId, { ...change.file, path }
    ));
    if (error) throw error;
    touched += 1;
  }
  const { count, error: countError } = await admin.from('drive_files')
    .select('*', { count: 'exact', head: true }).eq('owner_id', ownerId);
  if (countError) throw countError;
  return { count: count || 0, nextToken, touched };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Méthode refusée' }, 405);
  let ownerId = '';
  const admin = adminClient();
  let runId: number | null = null;
  try {
    const user = await authenticatedUser(req);
    ownerId = user.id;
    const { data: connection, error: connectionError } = await admin.from('drive_connections')
      .select('refresh_token_ciphertext,change_page_token').eq('owner_id', ownerId).single();
    if (connectionError || !connection) throw new Error('Google Drive n’est pas connecté');
    const mode = connection.change_page_token ? 'incremental' : 'full';
    const { data: run, error: runError } = await admin.from('drive_sync_runs')
      .insert({ owner_id: ownerId, mode, status: 'running' }).select('id').single();
    if (runError) throw runError;
    runId = run.id;
    const refreshToken = await decryptToken(connection.refresh_token_ciphertext);
    const accessToken = await refreshAccessToken(refreshToken);
    const result = mode === 'full'
      ? await fullSync(accessToken, ownerId, admin)
      : await incrementalSync(accessToken, ownerId, connection.change_page_token, admin);
    const now = new Date().toISOString();
    const { error: tokenError } = await admin.from('drive_connections').update({
      change_page_token: result.nextToken, updated_at: now
    }).eq('owner_id', ownerId);
    if (tokenError) throw tokenError;
    await admin.from('drive_connection_status').upsert({
      owner_id: ownerId, connected: true, last_synced_at: now,
      last_error: null, indexed_file_count: result.count, updated_at: now
    });
    await admin.from('drive_sync_runs').update({
      status: 'success', indexed_file_count: result.count, finished_at: now
    }).eq('id', runId);
    return json(req, { mode, indexedFileCount: result.count });
  } catch (error) {
    const message = safeError(error);
    if (ownerId) {
      await admin.from('drive_connection_status').upsert({
        owner_id: ownerId, connected: true, last_error: message, updated_at: new Date().toISOString()
      });
    }
    if (runId) await admin.from('drive_sync_runs').update({
      status: 'error', error_message: message, finished_at: new Date().toISOString()
    }).eq('id', runId);
    return json(req, { error: message }, 400);
  }
});
