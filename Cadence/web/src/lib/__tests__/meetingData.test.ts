import { describe, it, expect } from 'vitest';
import { parseMeeting, serializeMeeting, emptyMeeting } from '../meetingData';

describe('parseMeeting', () => {
  it('returns empty data for empty body', () => {
    expect(parseMeeting('')).toEqual({ data: emptyMeeting(), isLegacy: false, raw: {} });
    expect(parseMeeting('   ')).toEqual({ data: emptyMeeting(), isLegacy: false, raw: {} });
  });

  it('parses a well-formed JSON body', () => {
    const body = JSON.stringify({
      agenda: [{ id: 'a1', title: 'Topic A', notes: '', status: 'discuss' }],
      actions: [{ id: 'x1', title: 'Do thing', owner: 'me', due: '', done: false, pushed: false }],
      notes: 'Some notes',
    });
    const { data, isLegacy } = parseMeeting(body);
    expect(isLegacy).toBe(false);
    expect(data.agenda).toHaveLength(1);
    expect(data.agenda[0].title).toBe('Topic A');
    expect(data.actions[0].title).toBe('Do thing');
    expect(data.notes).toBe('Some notes');
  });

  it('treats plain text body as legacy', () => {
    const { data, isLegacy } = parseMeeting('Just some old plain text notes');
    expect(isLegacy).toBe(true);
    expect(data.notes).toBe('Just some old plain text notes');
    expect(data.agenda).toHaveLength(0);
    expect(data.actions).toHaveLength(0);
  });

  it('handles malformed JSON as legacy', () => {
    const { data, isLegacy } = parseMeeting('{broken json[');
    expect(isLegacy).toBe(true);
    expect(data.notes).toBe('{broken json[');
  });

  it('handles JSON that is not a meeting object as legacy', () => {
    const { isLegacy } = parseMeeting('"just a string"');
    expect(isLegacy).toBe(true);
  });

  it('tolerates missing keys in the meeting object', () => {
    const body = JSON.stringify({ agenda: [{ id: 'a', title: 'Q', notes: '', status: 'discuss' }] });
    const { data, isLegacy } = parseMeeting(body);
    expect(isLegacy).toBe(false);
    expect(data.actions).toEqual([]);
    expect(data.notes).toBe('');
  });

  it('returns isLegacy:false for an object with only actions key', () => {
    const body = JSON.stringify({ actions: [] });
    const { isLegacy } = parseMeeting(body);
    expect(isLegacy).toBe(false);
  });

  it('preserves unknown forward-compat keys through a parse/serialize round-trip', () => {
    const body = JSON.stringify({
      agenda: [],
      actions: [],
      notes: 'hi',
      version: 2,            // written by a newer client
      swift_only_field: 'x', // written by the Swift app
    });
    const { data, raw } = parseMeeting(body);
    const out = JSON.parse(serializeMeeting(data, raw));
    expect(out.version).toBe(2);
    expect(out.swift_only_field).toBe('x');
    expect(out.notes).toBe('hi');
  });
});
