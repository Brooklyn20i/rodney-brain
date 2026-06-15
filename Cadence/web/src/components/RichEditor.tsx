import React, { useEffect } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';

interface Props {
  content: string;
  onBlur?: (html: string) => void;
  onChange?: (html: string) => void;
  placeholder?: string;
}

function ToolbarBtn({ active, title, onClick, children }: { active?: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`re-btn${active ? ' re-btn-active' : ''}`}
    >
      {children}
    </button>
  );
}

function Divider() { return <span className="re-divider" />; }

function Toolbar({ editor }: { editor: Editor }) {
  const insertTable = () =>
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();

  return (
    <div className="re-toolbar">
      {/* History */}
      <ToolbarBtn title="Undo (⌘Z)" onClick={() => editor.chain().focus().undo().run()}>↩</ToolbarBtn>
      <ToolbarBtn title="Redo (⌘Y)" onClick={() => editor.chain().focus().redo().run()}>↪</ToolbarBtn>
      <Divider />

      {/* Paragraph style */}
      <select
        className="re-style-select"
        value={
          editor.isActive('heading', { level: 1 }) ? 'h1' :
          editor.isActive('heading', { level: 2 }) ? 'h2' :
          editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
          else if (v === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
          else if (v === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
          else editor.chain().focus().setParagraph().run();
        }}
      >
        <option value="p">Normal</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Divider />

      {/* Inline formatting */}
      <ToolbarBtn active={editor.isActive('bold')} title="Bold (⌘B)" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('italic')} title="Italic (⌘I)" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('underline')} title="Underline (⌘U)" onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('strike')} title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('highlight')} title="Highlight" onClick={() => editor.chain().focus().toggleHighlight().run()}>⬤</ToolbarBtn>
      <Divider />

      {/* Alignment */}
      <ToolbarBtn active={editor.isActive({ textAlign: 'left' })} title="Align left" onClick={() => editor.chain().focus().setTextAlign('left').run()}>⬅</ToolbarBtn>
      <ToolbarBtn active={editor.isActive({ textAlign: 'center' })} title="Align centre" onClick={() => editor.chain().focus().setTextAlign('center').run()}>⬌</ToolbarBtn>
      <ToolbarBtn active={editor.isActive({ textAlign: 'right' })} title="Align right" onClick={() => editor.chain().focus().setTextAlign('right').run()}>➡</ToolbarBtn>
      <Divider />

      {/* Lists */}
      <ToolbarBtn active={editor.isActive('bulletList')} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>• ≡</ToolbarBtn>
      <ToolbarBtn active={editor.isActive('orderedList')} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. ≡</ToolbarBtn>
      <ToolbarBtn active={editor.isActive('taskList')} title="Task list (checkboxes)" onClick={() => editor.chain().focus().toggleBulletList().run()}>☐ ≡</ToolbarBtn>
      <Divider />

      {/* Blocks */}
      <ToolbarBtn active={editor.isActive('blockquote')} title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>"</ToolbarBtn>
      <ToolbarBtn active={editor.isActive('code')} title="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}>{'<>'}</ToolbarBtn>
      <ToolbarBtn active={editor.isActive('codeBlock')} title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{ '```' }</ToolbarBtn>
      <ToolbarBtn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>─</ToolbarBtn>
      <Divider />

      {/* Table */}
      <ToolbarBtn title="Insert table" onClick={insertTable}>⊞ Table</ToolbarBtn>
      {editor.isActive('table') && <>
        <ToolbarBtn title="Add column after" onClick={() => editor.chain().focus().addColumnAfter().run()}>+col</ToolbarBtn>
        <ToolbarBtn title="Add row after" onClick={() => editor.chain().focus().addRowAfter().run()}>+row</ToolbarBtn>
        <ToolbarBtn title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>-col</ToolbarBtn>
        <ToolbarBtn title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>-row</ToolbarBtn>
        <ToolbarBtn title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>✕ tbl</ToolbarBtn>
      </>}
    </div>
  );
}

export function RichEditor({ content, onBlur, onChange, placeholder = 'Start typing…' }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    onBlur: ({ editor }) => onBlur?.(editor.getHTML()),
  });

  // Sync content prop when switching notes (selected note changes)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== content) {
      editor.commands.setContent(content || '');
    }
  }, [content]);

  if (!editor) return null;

  return (
    <div className="re-wrap">
      <Toolbar editor={editor} />
      <div className="re-body">
        <EditorContent editor={editor} className="re-content" />
      </div>
    </div>
  );
}
