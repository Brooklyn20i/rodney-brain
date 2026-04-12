import { NextRequest, NextResponse } from 'next/server';
import { loadAllNotes, searchNotes } from '@/lib/markdown-loader';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';

  const notes = loadAllNotes();
  const results = q ? searchNotes(notes, q) : notes;

  return NextResponse.json(results);
}
