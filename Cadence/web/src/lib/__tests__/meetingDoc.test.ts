import { describe, it, expect } from 'vitest';
import { isLegacyMeetingJson, legacyMeetingToHtml, meetingDocHtml, meetingPreviewText } from '../meetingDoc';
import { serializeMeeting } from '../meetingData';
import { toEditorHtml, htmlToPlain, isRichHtml } from '../richText';

const legacyBody = serializeMeeting({
  agenda: [
    { id: 'a1', title: 'Pricing strategy', notes: 'Needs Q3 numbers', status: 'covered' },
    { id: 'a2', title: 'Hiring plan', notes: '', status: 'deferred' },
  ],
  actions: [
    { id: 'x1', title: 'Send the deck', owner: 'me', due: '2026-07-20', done: false, pushed: true, pushed_to: 'My tasks' },
    { id: 'x2', title: 'Confirm budget', owner: 'them', owner_label: 'Anna', due: '', done: true, pushed: false },
  ],
  notes: 'General thoughts here',
});

describe('meetingDoc', () => {
  it('detects legacy structured bodies and not plain/HTML ones', () => {
    expect(isLegacyMeetingJson(legacyBody)).toBe(true);
    expect(isLegacyMeetingJson('<p>Hello</p>')).toBe(false);
    expect(isLegacyMeetingJson('plain words')).toBe(false);
    expect(isLegacyMeetingJson('{"unrelated":1}')).toBe(false);
  });

  it('converts a legacy meeting into a readable document without losing content', () => {
    const html = meetingDocHtml(legacyBody);
    expect(html).toContain('<h2>Agenda</h2>');
    expect(html).toContain('✅ Pricing strategy');
    expect(html).toContain('Needs Q3 numbers');
    expect(html).toContain('⏭ Hiring plan');
    expect(html).toContain('<h2>Actions</h2>');
    expect(html).toContain('☐ Send the deck');
    expect(html).toContain('→ filed to My tasks');
    expect(html).toContain('☑ Confirm budget');
    expect(html).toContain('(Anna)');
    expect(html).toContain('General thoughts here');
  });

  it('escapes HTML in legacy titles so content cannot inject markup', () => {
    const body = serializeMeeting({
      agenda: [{ id: 'a', title: '<img src=x onerror=alert(1)>', notes: '', status: 'discuss' }],
      actions: [], notes: '',
    });
    const html = legacyMeetingToHtml(JSON.parse(body));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('passes through modern HTML bodies and wraps plain text', () => {
    expect(meetingDocHtml('<p>Doc body</p>')).toBe('<p>Doc body</p>');
    expect(meetingDocHtml('line one\nline two')).toBe('<p>line one<br>line two</p>');
    expect(meetingDocHtml('')).toBe('');
  });

  it('previews read as plain text for any era', () => {
    expect(meetingPreviewText(legacyBody)).toContain('Pricing strategy');
    expect(meetingPreviewText('<p>Team <strong>sync</strong> notes</p>')).toBe('Team sync notes');
  });
});

describe('richText', () => {
  it('toEditorHtml wraps plain paragraphs and preserves HTML', () => {
    expect(toEditorHtml('a\n\nb')).toBe('<p>a</p><p>b</p>');
    expect(toEditorHtml('<ul><li>x</li></ul>')).toBe('<ul><li>x</li></ul>');
  });
  it('htmlToPlain flattens lists and entities', () => {
    expect(htmlToPlain('<ul><li>one</li><li>two &amp; three</li></ul>')).toBe('• one • two & three');
  });
  it('isRichHtml distinguishes editor HTML from angle-bracket text', () => {
    expect(isRichHtml('<p>x</p>')).toBe(true);
    expect(isRichHtml('a < b and c > d')).toBe(false);
  });
});
