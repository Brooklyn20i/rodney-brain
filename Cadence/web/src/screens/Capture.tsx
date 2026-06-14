import React, { useState } from 'react';
import { QuickAdd } from './QuickAdd';

export function Capture() {
  const [adding, setAdding] = useState(true);
  return (
    <>
      <div className="screen-header"><div><h1>Capture</h1><div className="subtitle">Fast input; triage later</div></div><button className="btn btn-primary" onClick={() => setAdding(true)}>+ Capture item</button></div>
      <div className="screen-content">
        <div className="focus-block"><div style={{ fontSize: 28 }}>⊡</div><div><small>Capture rule</small><p>Get it out of your head. Decide priority, owner and project during triage.</p></div></div>
        <div className="card"><div className="card-title">Current loop</div><p className="card-meta">Capture → Inbox triage → Today execution → Weekly Review.</p></div>
      </div>
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </>
  );
}
