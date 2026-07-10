// Single source of truth for project health and status presentation.
// Every screen that renders a health value must import from here — divergent
// per-screen maps are how the same project ends up amber on one screen and
// orange-labelled "At risk" with a red tint on another.

import type { Health, ProjectStatus } from './types';

export const HEALTH_LABEL: Record<Health, string> = {
  green: 'On track', amber: 'At risk', red: 'Off track',
};

export const HEALTH_COLOR: Record<Health, string> = {
  green: 'var(--green)', amber: 'var(--orange)', red: 'var(--red)',
};

export const HEALTH_BG: Record<Health, string> = {
  green: 'var(--green-bg)', amber: 'var(--orange-bg)', red: 'var(--red-bg)',
};

// CSS class used by the pill component styles (health-green/amber/red).
export const HEALTH_PILL_CLASS: Record<Health, string> = {
  green: 'health-green', amber: 'health-amber', red: 'health-red',
};

// <select>/<option> lists for pickers, in canonical order.
export const HEALTH_OPTIONS: { v: Health; label: string }[] = [
  { v: 'green', label: '🟢 On track' },
  { v: 'amber', label: '🟠 At risk' },
  { v: 'red', label: '🔴 Off track' },
];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active', onHold: 'On Hold', completed: 'Completed',
};

export const STATUS_ORDER: ProjectStatus[] = ['active', 'onHold', 'completed'];
