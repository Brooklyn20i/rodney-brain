// App-level "open Ace anywhere" plumbing. Screens call useAceUi().openAce()
// with an optional pre-built prompt; the provider renders the slide-over
// panel so no screen has to manage its own Ace state.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AcePanel } from '../components/AcePanel';

export interface OpenAceOptions {
  prompt?: string;       // pre-fill the composer (editable before send)
  autoSend?: boolean;    // fire the prompt immediately instead of pre-filling
  contextLabel?: string; // short label shown in the panel header (e.g. project name)
}

interface AceUiValue { openAce: (opts?: OpenAceOptions) => void; }

const AceUiContext = createContext<AceUiValue>({ openAce: () => {} });

export function useAceUi(): AceUiValue {
  return useContext(AceUiContext);
}

export function AceUiProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<OpenAceOptions | null>(null);
  // Re-mount the panel per open so a stale prompt/autoSend never leaks
  // into the next invocation.
  const [seq, setSeq] = useState(0);

  const openAce = useCallback((opts: OpenAceOptions = {}) => {
    setSeq((s) => s + 1);
    setPanel(opts);
  }, []);

  return (
    <AceUiContext.Provider value={{ openAce }}>
      {children}
      {panel && (
        <AcePanel
          key={seq}
          prompt={panel.prompt}
          autoSend={panel.autoSend}
          contextLabel={panel.contextLabel}
          onClose={() => setPanel(null)}
        />
      )}
    </AceUiContext.Provider>
  );
}
