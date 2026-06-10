import React from 'react';
import { EmptyState } from '../components/bits';

export function Placeholder({ title }: { title: string }) {
  return (
    <>
      <div className="screen-header"><div><h1>{title}</h1></div></div>
      <div className="screen-content">
        <EmptyState icon="🚧" title={`${title} — coming next`}
          sub="This screen is being rebuilt on the new backend. Today is live now." />
      </div>
    </>
  );
}
