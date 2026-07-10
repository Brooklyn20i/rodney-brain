import { useState } from 'react';
import { useAceUi } from '../lib/aceUi';

export interface AceAction { label: string; prompt: string; autoSend?: boolean; }

// "◆ Ask Ace" affordance for entity headers. One action = direct button;
// several = a small picker. Prompts open in the slide-over panel, editable
// before send unless the action opts into autoSend.
export function AceActionButton({ actions, contextLabel }: {
  actions: AceAction[];
  contextLabel?: string;
}) {
  const { openAce } = useAceUi();
  const [open, setOpen] = useState(false);

  const run = (a: AceAction) => {
    setOpen(false);
    openAce({ prompt: a.prompt, autoSend: a.autoSend, contextLabel });
  };

  if (actions.length === 1) {
    return (
      <button className="btn btn-ghost btn-sm ace-action-btn" onClick={() => run(actions[0])}>
        ◆ {actions[0].label}
      </button>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-ghost btn-sm ace-action-btn" onClick={() => setOpen((s) => !s)}>
        ◆ Ask Ace
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div className="action-send-picker ace-action-picker">
            {actions.map((a) => (
              <button key={a.label} className="send-picker-option" onClick={() => run(a)}>
                ◆ {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
