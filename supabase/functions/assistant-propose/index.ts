import {
  ASSISTANT_MODEL, ASSISTANT_RESPONSE_SCHEMA, JOURNAL_DAYS, buildOperations,
  modelMessages, selectDriveCandidates, validateModelProposal
} from '../_shared/assistant.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { adminClient, authenticatedUser } from '../_shared/supabase.ts';

function validWeekKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function openRouterProposal(conversation: string[], context: { weekKey: string; day: typeof JOURNAL_DAYS[number] }, candidates: Parameters<typeof modelMessages>[2]) {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OpenRouter n’est pas configuré');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://benistad.github.io/cahier-journal-2026/',
        'X-Title': 'Cahier Journal 2026'
      },
      body: JSON.stringify({
        model: ASSISTANT_MODEL,
        messages: modelMessages(conversation, context, candidates),
        stream: false,
        max_completion_tokens: 2500,
        provider: { require_parameters: true, zdr: true, data_collection: 'deny' },
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'cahier_journal_proposal', strict: true, schema: ASSISTANT_RESPONSE_SCHEMA }
        }
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`OpenRouter a refusé la proposition (${response.status})`);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('OpenRouter n’a pas renvoyé de proposition');
    return { value: JSON.parse(content), usage: payload.usage || null };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Méthode refusée' }, 405);
  try {
    const user = await authenticatedUser(req);
    const body = await req.json();
    const rawConversation = Array.isArray(body?.conversation)
      ? body.conversation
      : (typeof body?.narrative === 'string' ? [body.narrative] : []);
    const conversation = rawConversation.map((message: unknown) => typeof message === 'string' ? message.trim() : '');
    const conversationLength = conversation.reduce((total: number, message: string) => total + message.length, 0);
    if (!conversation.length || conversation.length > 12 || conversation.some((message: string) => message.length < 2 || message.length > 8000) || conversationLength > 16000) {
      return json(req, { error: 'Conversation trop courte ou trop longue' }, 400);
    }
    if (!validWeekKey(body?.weekKey) || !JOURNAL_DAYS.includes(body?.day)) {
      return json(req, { error: 'Jour cible invalide' }, 400);
    }
    const context = { weekKey: body.weekKey, day: body.day as typeof JOURNAL_DAYS[number] };
    const admin = adminClient();
    const { data: files, error } = await admin.from('drive_files')
      .select('file_id,title,mime_type,web_view_link,path,subject,notion,sequence,role,content_excerpt')
      .eq('owner_id', user.id).limit(5000);
    if (error) throw error;
    const fullNarrative = conversation.join('\n');
    const candidates = selectDriveCandidates(files || [], fullNarrative, 5);
    const completion = await openRouterProposal(conversation, context, candidates);
    const proposal = validateModelProposal(completion.value, new Set(candidates.map(file => file.file_id)));
    return json(req, {
      proposal: {
        summary: proposal.summary,
        clarificationNeeded: proposal.clarificationNeeded,
        clarificationQuestion: proposal.clarificationQuestion,
        operations: buildOperations(proposal, context, candidates)
      },
      candidateCount: candidates.length,
      model: ASSISTANT_MODEL,
      usage: completion.usage
    });
  } catch (error) {
    console.error('assistant-propose', safeError(error));
    return json(req, { error: 'L’assistant n’a pas pu préparer une proposition fiable' }, 502);
  }
});
