/* Adaptateur Supabase testable : Auth, lecture, initialisation et CAS par révision. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./journal-schema.js'));
  } else {
    root.CJSupabaseSync = factory(root.CJSchema);
  }
})(typeof self !== 'undefined' ? self : this, function (CJSchema) {
  function normalizeRow(row) {
    if (!row) return null;
    return {
      ownerId: row.owner_id,
      revision: Number(row.revision),
      updatedAt: row.updated_at,
      data: CJSchema.migrate(row.data)
    };
  }

  function isConflictError(error) {
    return Boolean(error && (error.code === '40001' || /revision conflict/i.test(error.message || '')));
  }

  function shouldSeedFromPublished(data) {
    const journal = CJSchema.migrate(data);
    return Object.keys(journal.weeks).length === 0;
  }

  function createSyncClient(client) {
    if (!client) throw new Error('Client Supabase requis');
    let revision = null;
    let userId = null;
    let channel = null;

    async function getSession() {
      const response = await client.auth.getSession();
      if (response.error) throw response.error;
      return response.data.session || null;
    }

    async function sendMagicLink(email, redirectTo) {
      const response = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: redirectTo }
      });
      if (response.error) throw response.error;
      return response.data;
    }

    async function signOut() {
      const response = await client.auth.signOut();
      if (response.error) throw response.error;
      revision = null;
      userId = null;
    }

    async function requireUser() {
      const session = await getSession();
      if (!session || !session.user) throw new Error('Session requise');
      userId = session.user.id;
      return session.user;
    }

    async function fetchCurrent() {
      const user = await requireUser();
      const response = await client
        .from('journal_state')
        .select('owner_id, schema_version, revision, data, updated_at')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (response.error) throw response.error;
      const row = normalizeRow(response.data);
      revision = row ? row.revision : null;
      return row;
    }

    async function initialize(data) {
      await requireUser();
      const response = await client.rpc('initialize_journal', { p_initial_data: CJSchema.migrate(data) });
      if (response.error) throw response.error;
      const row = normalizeRow(response.data);
      revision = row.revision;
      return row;
    }

    async function save(data, expectedRevision) {
      await requireUser();
      const expected = expectedRevision === undefined ? revision : expectedRevision;
      if (!Number.isInteger(expected) || expected < 1) throw new Error('Révision distante inconnue');
      const response = await client.rpc('save_journal', {
        p_expected_revision: expected,
        p_new_data: CJSchema.migrate(data)
      });
      if (response.error) {
        if (isConflictError(response.error)) return { status: 'conflict', error: response.error };
        throw response.error;
      }
      const row = normalizeRow(response.data);
      revision = row.revision;
      return { status: 'saved', row };
    }

    function subscribe(onChange) {
      if (!userId) throw new Error('Session requise avant abonnement');
      if (channel) client.removeChannel(channel);
      channel = client
        .channel(`journal-${userId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'journal_state', filter: `owner_id=eq.${userId}`
        }, payload => onChange(normalizeRow(payload.new)))
        .subscribe();
      return channel;
    }

    function disconnect() {
      if (channel) client.removeChannel(channel);
      channel = null;
    }

    return {
      getSession,
      sendMagicLink,
      signOut,
      fetchCurrent,
      initialize,
      save,
      subscribe,
      disconnect,
      getRevision: () => revision,
      setRevision: value => { revision = value; }
    };
  }

  return { normalizeRow, isConflictError, shouldSeedFromPublished, createSyncClient };
});
