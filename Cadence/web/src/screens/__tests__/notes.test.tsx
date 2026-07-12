/**
 * Notes screen — search, folder-create modal, and the multi-device stale-guard
 * (never save when clean; adopt remote silently when clean; ask when dirty).
 */
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emptyData } from '../../lib/types';

const h = vi.hoisted(() => ({ store: {} as any }));
vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));
// tiptap is too heavy for jsdom — a textarea keeps the same contract.
vi.mock('../../components/RichEditor', () => ({
  RichEditor: ({ content, onChange, onBlur }: any) => (
    <textarea
      data-testid="rich-editor"
      defaultValue={content}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onBlur?.((e.target as HTMLTextAreaElement).value)}
    />
  ),
}));

import { Notes } from '../Notes';

const T0 = '2026-06-01T00:00:00.000Z';
const T1 = '2026-06-01T00:10:00.000Z';
const mkNote = (o: any) => ({
  id: 'n1', title: 'Alpha', body: '<p>Hello world</p>', folder: '',
  created_at: T0, updated_at: T0, deleted_at: null, ...o,
});

function setStore(notes: any[]) {
  h.store = {
    insert: vi.fn().mockImplementation(async (_t: string, row: any) => ({ id: 'new-note', updated_at: T0, ...row })),
    update: vi.fn().mockResolvedValue({ updated_at: '2026-06-01T00:20:00.000Z' }),
    remove: vi.fn(),
    logActivity: vi.fn(),
    session: { user: { id: 'me', email: 'r@x.com' } },
    ready: true, configured: true, canEdit: true,
    data: { ...emptyData(), notes },
  };
}
const setNotes = (notes: any[]) => { h.store = { ...h.store, data: { ...h.store.data, notes } }; };
const renderNotes = () => render(<Notes onMenu={() => {}} />);
const rerenderNotes = (r: any) => r.rerender(<Notes onMenu={() => {}} />);
const titleInput = () => document.getElementById('note-title-input') as HTMLInputElement;

beforeEach(() => setStore([mkNote({})]));
afterEach(() => cleanup());

describe('Notes search', () => {
  it('filters by title and full body text, and never surfaces system notes', () => {
    setStore([
      mkNote({ id: 'n1', title: 'Roadmap', body: '<p>quarterly <b>pricing</b> plan</p>' }),
      mkNote({ id: 'n2', title: 'Journal', body: '<p>gym schedule</p>' }),
      mkNote({ id: 'n3', title: '__agenda__p1', body: 'pricing' }),
      mkNote({ id: 'n4', title: 'Old minutes', folder: '__mtg__p1', body: 'pricing' }),
    ]);
    renderNotes();
    fireEvent.change(screen.getByPlaceholderText('Search notes…'), { target: { value: 'pricing' } });
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(screen.queryByText('Journal')).not.toBeInTheDocument();
    expect(screen.queryByText('__agenda__p1')).not.toBeInTheDocument();
    expect(screen.queryByText('Old minutes')).not.toBeInTheDocument();

    // Clearing the query restores the folder tree.
    fireEvent.change(screen.getByPlaceholderText('Search notes…'), { target: { value: '' } });
    expect(screen.getByText('Journal')).toBeInTheDocument();
    expect(screen.getByText('All Notes')).toBeInTheDocument();
  });

  it('says so when nothing matches', () => {
    renderNotes();
    fireEvent.change(screen.getByPlaceholderText('Search notes…'), { target: { value: 'zzz-nope' } });
    expect(screen.getByText(/No notes match/)).toBeInTheDocument();
  });
});

describe('Notes folder creation', () => {
  it('uses a modal, not window.prompt', () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    renderNotes();
    fireEvent.click(screen.getByRole('button', { name: '+ Folder' }));
    expect(promptSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'New folder' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. Leadership'), { target: { value: 'Leadership' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.queryByRole('heading', { name: 'New folder' })).not.toBeInTheDocument();
    expect(screen.getByText('Leadership')).toBeInTheDocument();
    promptSpy.mockRestore();
  });

  it('creating a folder from the note picker moves the open note into it', async () => {
    renderNotes();
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.change(document.querySelector('.note-folder-select')!, { target: { value: '__new__' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Leadership'), { target: { value: 'Deals' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create' })); });
    expect(h.store.update).toHaveBeenCalledWith('notes', 'n1', { folder: 'Deals' });
  });
});

describe('Notes stale-guard', () => {
  it('never writes when closed or blurred without edits', async () => {
    renderNotes();
    fireEvent.click(screen.getByText('Alpha'));
    await act(async () => { fireEvent.blur(titleInput()); });
    await act(async () => { fireEvent.blur(screen.getByTestId('rich-editor')); });
    expect(h.store.update).not.toHaveBeenCalled();
  });

  it('saves on blur once the user actually edits', async () => {
    renderNotes();
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.change(titleInput(), { target: { value: 'Alpha renamed' } });
    await act(async () => { fireEvent.blur(titleInput()); });
    expect(h.store.update).toHaveBeenCalledWith('notes', 'n1', { title: 'Alpha renamed' });
  });

  it('adopts a remote change silently while clean', () => {
    const r = renderNotes();
    fireEvent.click(screen.getByText('Alpha'));
    setNotes([mkNote({ title: 'Alpha v2', body: '<p>Remote body</p>', updated_at: T1 })]);
    rerenderNotes(r);
    expect(titleInput().value).toBe('Alpha v2');
    expect((screen.getByTestId('rich-editor') as HTMLTextAreaElement).value).toBe('<p>Remote body</p>');
    expect(screen.queryByText(/changed on another device/)).not.toBeInTheDocument();
  });

  it('offers Load theirs / Keep mine when both sides changed', () => {
    const r = renderNotes();
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.change(titleInput(), { target: { value: 'Local edit' } });
    setNotes([mkNote({ title: 'Remote v2', updated_at: T1 })]);
    rerenderNotes(r);
    expect(screen.getByText(/changed on another device/)).toBeInTheDocument();
    expect(titleInput().value).toBe('Local edit'); // local edits untouched

    fireEvent.click(screen.getByRole('button', { name: 'Load theirs' }));
    expect(titleInput().value).toBe('Remote v2');
    expect(screen.queryByText(/changed on another device/)).not.toBeInTheDocument();
  });

  it('Keep mine dismisses the banner and preserves the local draft', () => {
    const r = renderNotes();
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.change(titleInput(), { target: { value: 'Local edit' } });
    setNotes([mkNote({ title: 'Remote v2', updated_at: T1 })]);
    rerenderNotes(r);
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(screen.queryByText(/changed on another device/)).not.toBeInTheDocument();
    expect(titleInput().value).toBe('Local edit');
    // …and it doesn't re-trigger on the next render of the same version.
    rerenderNotes(r);
    expect(screen.queryByText(/changed on another device/)).not.toBeInTheDocument();
  });
});
