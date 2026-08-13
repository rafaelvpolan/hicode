import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PackageManager } from './types'

export interface PackageJson {
  name?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

const LOCKFILES: Array<[string, PackageManager]> = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

const FRAMEWORKS: Array<[string, string]> = [
  ['nuxt', 'Nuxt'],
  ['next', 'Next.js'],
  ['@remix-run/react', 'Remix'],
  ['astro', 'Astro'],
  ['@nestjs/core', 'NestJS'],
  ['svelte', 'Svelte'],
  ['solid-js', 'Solid'],
  ['vue', 'Vue 3'],
  ['react-native', 'React Native'],
  ['react', 'React'],
  ['express', 'Express'],
  ['fastify', 'Fastify'],
]

const BUNDLERS: Array<[string, string]> = [
  ['vite', 'Vite'],
  ['webpack', 'webpack'],
  ['@rspack/core', 'Rspack'],
  ['react-scripts', 'CRA'],
]

export function readPackageJson(dir: string): PackageJson | null {
  const f = join(dir, 'package.json')
  if (!existsSync(f)) return null
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

export function detectPackageManager(root: string): PackageManager {
  for (const [file, pm] of LOCKFILES) if (existsSync(join(root, file))) return pm
  return 'npm'
}

export function allDeps(pkg: PackageJson | null): Record<string, string> {
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }
}

export function detectFramework(pkg: PackageJson | null): string {
  const deps = allDeps(pkg)
  for (const [dep, label] of FRAMEWORKS) if (deps[dep]) return label
  return ''
}

export function detectBundler(pkg: PackageJson | null): string {
  const deps = allDeps(pkg)
  for (const [dep, label] of BUNDLERS) if (deps[dep]) return label
  return ''
}

export function detectLanguage(dir: string, pkg: PackageJson | null): string {
  if (existsSync(join(dir, 'tsconfig.json')) || allDeps(pkg).typescript) return 'TypeScript'
  return 'JavaScript'
}

const CONFIG_FILES = ['vite.config.ts', 'vite.config.js', 'nuxt.config.ts', 'next.config.js', 'next.config.mjs', 'svelte.config.js', 'astro.config.mjs']

export function detectDevPort(dir: string): number {
  for (const f of CONFIG_FILES) {
    const p = join(dir, f)
    if (!existsSync(p)) continue
    try {
      const m = readFileSync(p, 'utf8').match(/port\s*:\s*(\d{2,5})/)
      if (m?.[1]) return Number(m[1])
    } catch {
      continue
    }
  }
  const pkg = readPackageJson(dir)
  const dev = pkg?.scripts?.dev ?? ''
  const m = dev.match(/--port[= ](\d{2,5})|-p[= ](\d{2,5})/)
  return Number(m?.[1] ?? m?.[2] ?? 0)
}

function yamlPackages(file: string): string[] {
  try {
    const out: string[] = []
    let inside = false
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.replace(/#.*$/, '').trimEnd()
      if (/^packages\s*:/.test(line)) { inside = true; continue }
      if (inside) {
        const m = line.match(/^\s*-\s*["']?([^"'\s]+)["']?\s*$/)
        if (m?.[1]) out.push(m[1])
        else if (line.trim() && !/^\s/.test(line)) break
      }
    }
    return out
  } catch {
    return []
  }
}

export function detectWorkspaceGlobs(root: string): string[] {
  const pnpm = join(root, 'pnpm-workspace.yaml')
  if (existsSync(pnpm)) return yamlPackages(pnpm)
  const pkg = readPackageJson(root)
  const ws = pkg?.workspaces
  if (Array.isArray(ws)) return ws
  if (ws && Array.isArray(ws.packages)) return ws.packages
  return []
}

export function expandGlobs(root: string, globs: string[]): string[] {
  const out: string[] = []
  for (const g of globs) {
    const clean = g.replace(/\/$/, '')
    if (!clean.includes('*')) {
      if (existsSync(join(root, clean, 'package.json'))) out.push(clean)
      continue
    }
    const base = clean.slice(0, clean.indexOf('*')).replace(/\/$/, '')
    const dir = join(root, base)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      const rel = base ? `${base}/${entry}` : entry
      const full = join(root, rel)
      try {
        if (statSync(full).isDirectory() && existsSync(join(full, 'package.json'))) out.push(rel)
      } catch {
        continue
      }
    }
  }
  return [...new Set(out)].sort()
}
