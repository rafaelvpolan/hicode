import { run } from '../runner/git'

interface OsIssue {
  level?: string
  path?: string
  message?: string
}

interface OsItem {
  name?: string
  valid?: boolean
  issues?: OsIssue[]
}

interface OsValidate {
  items?: OsItem[]
  summary?: { totals?: { failed?: number; passed?: number } }
}

export interface SpecValidation {
  ok: boolean
  failed: number
  issues: string[]
}

export function parseValidation(stdout: string): SpecValidation {
  try {
    const j = JSON.parse(stdout) as OsValidate
    const failed = j.summary?.totals?.failed ?? 1
    const issues: string[] = []
    for (const it of j.items ?? []) {
      for (const i of it.issues ?? []) {
        if (i.message) issues.push(`${i.path ?? ''}: ${i.message}`)
      }
    }
    return { ok: failed === 0, failed, issues }
  } catch {
    return { ok: false, failed: 1, issues: ['saida de validacao openspec nao parseavel'] }
  }
}

export async function openspecAvailable(): Promise<boolean> {
  const { err } = await run('openspec', ['--version'], { timeout: 10000 })
  return !err
}

export async function initOpenspec(dir: string): Promise<boolean> {
  const { err } = await run('openspec', ['init', '.', '--tools', 'none', '--force'], { cwd: dir, timeout: 60000 })
  return !err
}

export async function validateChange(dir: string, name: string): Promise<SpecValidation> {
  const { err, stdout, stderr } = await run('openspec', ['validate', name, '--strict', '--json', '--no-interactive'], { cwd: dir, timeout: 60000 })
  const v = parseValidation(stdout)
  if (!v.ok && err) v.issues.push(`openspec erro: ${String(err.message || '').slice(0, 120)} ${String(stderr || '').slice(0, 160)}`.trim())
  return v
}
