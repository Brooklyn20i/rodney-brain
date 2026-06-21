import Anthropic from '@anthropic-ai/sdk';

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey || !supabaseUrl || !supabaseKey) {
    return new Response('Server not configured', { status: 500, headers: CORS });
  }

  const body = await req.json() as { messages: Array<{ role: 'user' | 'assistant'; content: string }>; token: string };
  const { messages, token } = body;

  if (!token || !messages?.length) {
    return new Response('Bad request', { status: 400, headers: CORS });
  }

  // Verify Supabase session
  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
  });
  if (!authRes.ok) return new Response('Unauthorized', { status: 401, headers: CORS });
  const user: { id: string } = await authRes.json();

  // Pull live context for the user
  const h = { Authorization: `Bearer ${token}`, apikey: supabaseKey, 'Prefer': 'count=none' };
  const base = `${supabaseUrl}/rest/v1`;
  const uid = user.id;

  const [wi, proj, dec, ppl] = await Promise.allSettled([
    fetch(`${base}/work_items?owner_id=eq.${uid}&done=eq.false&deleted_at=is.null&select=title,type,priority,due_date&limit=50`, { headers: h }).then(r => r.json()),
    fetch(`${base}/projects?owner_id=eq.${uid}&deleted_at=is.null&select=name,status,health,goal,next_action&limit=20`, { headers: h }).then(r => r.json()),
    fetch(`${base}/decisions?owner_id=eq.${uid}&status=eq.pending&deleted_at=is.null&select=title&limit=20`, { headers: h }).then(r => r.json()),
    fetch(`${base}/people?owner_id=eq.${uid}&deleted_at=is.null&select=name,role&limit=30`, { headers: h }).then(r => r.json()),
  ]);

  const tasks = wi.status === 'fulfilled' ? wi.value : [];
  const projects = proj.status === 'fulfilled' ? proj.value : [];
  const decisions = dec.status === 'fulfilled' ? dec.value : [];
  const people = ppl.status === 'fulfilled' ? ppl.value : [];
  const today = new Date().toISOString().split('T')[0];

  const system = `You are the Cadence AI assistant — a concise, direct productivity coach with live context on the user's work.

Today: ${today}

Open tasks (${tasks.length}): ${JSON.stringify(tasks)}
Active projects (${projects.length}): ${JSON.stringify(projects)}
Pending decisions (${decisions.length}): ${JSON.stringify(decisions)}
People (${people.length}): ${JSON.stringify(people)}

Be specific — use real task/project names. Suggest concrete next actions. Keep replies tight.`;

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system,
          messages,
          stream: true,
        });
        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            ctrl.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch {
        ctrl.enqueue(encoder.encode('\n[Error generating response — please try again]'));
      }
      ctrl.close();
    },
  });

  return new Response(stream, {
    headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
