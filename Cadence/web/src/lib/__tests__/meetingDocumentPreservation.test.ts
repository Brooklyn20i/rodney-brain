import { describe, expect, it } from 'vitest';
import { meetingDocHtml, meetingDocumentBody, meetingPreviewText } from '../meetingDoc';

describe('legacy meeting identity preservation', () => {
  it('keeps original structured IDs and metadata through rich-text edits', () => {
    const legacy = { agenda: [{ id: 'agenda-1', title: 'Decision', notes: '', status: 'discuss' }], actions: [{ id: 'action-1', work_item_id: 'exact-linked-id', pushed: true, title: 'Prepare pack', owner: 'me', done: false }], notes: 'Original', custom: { evidence: 'retain me' } };
    const saved = meetingDocumentBody(JSON.stringify(legacy), '<p>Edited narrative</p>');
    expect(JSON.parse(saved)).toMatchObject(legacy);
    expect(meetingDocHtml(saved)).toBe('<p>Edited narrative</p>');
    expect(meetingPreviewText(saved)).toBe('Edited narrative');
    const savedAgain = meetingDocumentBody(saved, '<p>Second edit</p>');
    expect(JSON.parse(savedAgain)).toMatchObject(legacy);
    expect(meetingDocHtml(savedAgain)).toBe('<p>Second edit</p>');
  });
  it('keeps normal HTML documents as HTML', () => {
    expect(meetingDocumentBody('<p>Old</p>', '<p>New</p>')).toBe('<p>New</p>');
  });
});
