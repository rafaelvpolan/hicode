import type { RunView } from '#shared/types'

export function fmtTime(s: number | undefined): string {
  const n = Number(s) || 0
  return n >= 60 ? `${Math.floor(n / 60)}m${n % 60}s` : `${n}s`
}

export function fmtDt(ts: string): string {
  try { return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) } catch { return String(ts) }
}

export function escTip(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return String(s == null ? '' : s).replace(/[&<>"]/g, (m) => map[m])
}

export function runsFor(runs: RunView[], id: string): RunView[] {
  return runs.filter((r) => String(r.id) === String(id)).sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
}

export function useFormat() {
  return { fmtTime, fmtDt, escTip, runsFor }
}
