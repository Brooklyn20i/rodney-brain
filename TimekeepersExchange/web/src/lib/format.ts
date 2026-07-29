export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

export function timeRemaining(closesAt: string): { label: string; expired: boolean } {
  const ms = new Date(closesAt).getTime() - Date.now()
  if (ms <= 0) return { label: 'Closed', expired: true }
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  const mins = Math.floor((ms % 3600000) / 60000)
  if (days > 0) return { label: `${days}d ${hours}h remaining`, expired: false }
  if (hours > 0) return { label: `${hours}h ${mins}m remaining`, expired: false }
  return { label: `${mins}m remaining`, expired: false }
}

export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString()
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
