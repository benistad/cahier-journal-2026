/* Client Drive sans secret : fonctions serveur, statut, catalogue et recherche locale. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./drive-catalog.js'));
  } else {
    root.CJDriveClient = factory(root.CJDriveCatalog);
  }
})(typeof self !== 'undefined' ? self : this, function (DriveCatalog) {
  function createDriveClient(client) {
    if (!client) throw new Error('Client Supabase requis');
    let catalog = [];

    async function status() {
      const response = await client.from('drive_connection_status')
        .select('connected,google_email,last_synced_at,last_error,indexed_file_count')
        .maybeSingle();
      if (response.error) throw response.error;
      return response.data || { connected: false, indexed_file_count: 0 };
    }

    async function startOAuth() {
      const response = await client.functions.invoke('drive-auth-start', { body: {} });
      if (response.error) throw response.error;
      if (!response.data || !response.data.authorizationUrl) throw new Error('Adresse Google OAuth manquante');
      return response.data.authorizationUrl;
    }

    async function sync() {
      const response = await client.functions.invoke('drive-sync', { body: {} });
      if (response.error) throw response.error;
      return response.data;
    }

    async function loadCatalog() {
      const response = await client.from('drive_files')
        .select('file_id,title,mime_type,web_view_link,modified_time,path,subject,notion,sequence,role,content_excerpt')
        .order('modified_time', { ascending: false })
        .limit(5000);
      if (response.error) throw response.error;
      catalog = (response.data || []).map(row => DriveCatalog.normalizeDocument({
        file_id: row.file_id,
        title: row.title,
        mime_type: row.mime_type,
        web_view_link: row.web_view_link,
        modified_time: row.modified_time,
        path: row.path,
        subject: row.subject,
        notion: row.notion,
        sequence: row.sequence,
        role: row.role,
        indexed_text: row.content_excerpt
      }, row.path));
      return catalog;
    }

    function search(query, options = {}) {
      return DriveCatalog.searchCatalog(catalog, query, options);
    }

    return { status, startOAuth, sync, loadCatalog, search, getCatalog: () => [...catalog] };
  }

  return { createDriveClient };
});
