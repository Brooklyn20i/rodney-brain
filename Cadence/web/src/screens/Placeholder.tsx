import React from 'react';
import { EmptyState } from '../components/bits';

export function Placeholder({ title, onMenu }: { title: string; onMenu?: () => void }) {
  return (
    <>
      <div className="screen-header">
        <div className="header-left">
          <button className="menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
          <div><h1>{title}</h1></div>
        </div>
      </div>
      <div className="screen-content">
        <EmptyState icon="🚧" title={`${title} — coming next`}
          sub="This screen is being rebuilt on the new backend. Today is live now." />
      </div>
    </>
  );
}
