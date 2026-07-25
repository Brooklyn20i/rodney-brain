import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { WorkItem } from '../../lib/types';
import { TaskDetailPanel } from './TaskDetailPanel';

// The task editor as a slide-over: the commitments board keeps the full
// screen width, and the detail appears on demand instead of permanently
// occupying half of Home. TaskDetailPanel itself is unchanged — same
// `.task-detail` chrome, ball control, raise button, updates thread.
// Close = unmount (no exit animation — e2e asserts post-close state
// immediately).
export function TaskSlideOver({ task, onClose }: { task: WorkItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="slideover-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="slideover-panel" role="dialog" aria-label="Task detail">
        <TaskDetailPanel task={task} onClose={onClose} />
      </aside>
    </div>,
    document.body,
  );
}
