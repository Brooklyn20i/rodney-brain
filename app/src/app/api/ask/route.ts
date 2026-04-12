import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { loadAllNotes, findRelevantNotes } from '@/lib/markdown-loader';

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured. Add it to .env.local.' },
      { status: 503 },
    );
  }

  let question: string;
  try {
    const body = await request.json();
    question = body?.question?.trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const notes = loadAllNotes();
  const relevant = findRelevantNotes(notes, question, 5);

  // Build note context for the LLM — each note clearly labelled with its filename
  const notesContext = relevant
    .map(
      (n) =>
        `### ${n.title}${n.author ? ` — ${n.author}` : ''}\n` +
        `**File:** ${n.filename}\n` +
        `**Date:** ${n.date}  **Tags:** ${n.tags.map((t) => `#${t}`).join(' ')}\n\n` +
        n.content,
    )
    .join('\n\n---\n\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text:
          'You are a personal knowledge assistant for a private AI Brain. ' +
          'Answer the user\'s question using ONLY the notes provided — do not invent facts. ' +
          'Be concise and insightful. When you reference a note, mention its title. ' +
          'If the notes lack enough information to answer, say so clearly.',
        // Cache the system prompt — it never changes
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `Here are the relevant notes from the knowledge base:\n\n${notesContext}`,
        // Cache the note context — same set is reused across repeated questions
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: question }],
  });

  const answer =
    response.content[0].type === 'text' ? response.content[0].text : '';

  return NextResponse.json({
    answer,
    sources: relevant.map((n) => ({
      id: n.id,
      title: n.title,
      filename: n.filename,
      author: n.author,
    })),
  });
}
