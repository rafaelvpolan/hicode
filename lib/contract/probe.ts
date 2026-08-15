import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  detectBundler, detectDevPort, detectFramework, detectLanguage,
  detectPackageManager, detectWorkspaceGlobs, expandGlobs, readPackageJson,
} from './detect'
import type { Commands, Contract, ContractSource, PackageInfo, PackageManager, RepoShape } from './types'

const HASHED = ['package.json', 'pnpm-workspace.yaml', 'turbo.json', 'nx.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'tsconfig.json', '.codefox.yaml']
const SKIP_DIRS = ['node_modules', 'docs', 'infra', 'dist', 'build', '.git', 'vendor']

function runner(pm: PackageManager): string {
  return pm === 'npm' ? 'npm run' : `${pm} run`
}

function filterFlag(pm: PackageManager, pkg: string): string {
  if (!pkg) return ''
  if (pm === 'pnpm') return `pnpm --filter ${pkg} `
  if (pm === 'yarn') return `yarn workspace ${pkg} `
  if (pm === 'bun') return `bun --filter ${pkg} `
  return `npm -w ${pkg} `
}

function pick(scripts: string[], names: string[]): string {
  return names.find(n => scripts.includes(n)) ?? ''
}

export function commandsFor(pm: PackageManager, scripts: string[], workspaceName = ''): Commands {
  const prefix = filterFlag(pm, workspaceName)
  const cmd = (script: string): string => {
    if (!script) return ''
    return prefix ? `${prefix}run ${script}` : `${runner(pm)} ${script}`
  }
  return {
    install: `${pm} install`,
    build: cmd(pick(scripts, ['build'])),
    test: cmd(pick(scripts, ['test', 'test:unit'])),
    lint: cmd(pick(scripts, ['lint'])),
    typecheck: cmd(pick(scripts, ['typecheck', 'type-check'])),
    dev: cmd(pick(scripts, ['dev', 'start', 'serve'])),
  }
}

export function stackPhrase(main: PackageInfo | undefined, shape: RepoShape, total: number, bundler: string): string {
  if (!main) return 'stack nao detectado (sem package.json)'
  const parts = [bundler, main.framework, main.language].filter(Boolean)
  const base = parts.length ? parts.join(' + ') : 'stack nao detectado'
  if (shape === 'single') return `${base} (${main.packageManager})`
  const rotulo = shape === 'poly' ? 'poli-repo' : 'monorepo'
  return `${base} · ${rotulo} com ${total} projetos`
}

function inspectPackage(root: string, rel: string, workspacePm?: PackageManager, workspaceName = ''): PackageInfo | null {
  const dir = rel ? join(root, rel) : root
  const pkg = readPackageJson(dir)
  if (!pkg) return null
  const pm = workspacePm ?? detectPackageManager(dir)
  const scripts = Object.keys(pkg.scripts ?? {})
  return {
    name: pkg.name ?? basename(dir),
    path: rel,
    framework: detectFramework(pkg),
    language: detectLanguage(dir, pkg),
    packageManager: pm,
    scripts,
    devPort: detectDevPort(dir),
    commands: commandsFor(pm, scripts, workspaceName),
  }
}

function polyDirs(root: string): string[] {
  try {
    return readdirSync(root)
      .filter(d => !d.startsWith('.') && !SKIP_DIRS.includes(d))
      .filter(d => {
        try {
          return statSync(join(root, d)).isDirectory() && existsSync(join(root, d, 'package.json'))
        } catch {
          return false
        }
      })
      .sort()
  } catch {
    return []
  }
}

function collect(root: string): { shape: RepoShape; packages: PackageInfo[] } {
  const rootPkg = readPackageJson(root)
  const globs = detectWorkspaceGlobs(root)
  if (globs.length) {
    const pm = detectPackageManager(root)
    const rels = expandGlobs(root, globs)
    const packages = [inspectPackage(root, '', pm), ...rels.map(r => inspectPackage(root, r, pm, readPackageJson(join(root, r))?.name ?? ''))]
      .filter((p): p is PackageInfo => p !== null)
    return { shape: 'workspaces', packages }
  }
  if (rootPkg) {
    const p = inspectPackage(root, '')
    return { shape: 'single', packages: p ? [p] : [] }
  }
  const packages = polyDirs(root)
    .map(d => inspectPackage(root, d))
    .filter((p): p is PackageInfo => p !== null)
  return { shape: packages.length ? 'poly' : 'single', packages }
}

function hashSources(root: string, packages: PackageInfo[]): { hash: string; sources: ContractSource[] } {
  const sources: ContractSource[] = []
  const all = createHash('sha256')
  const files = [...HASHED, ...packages.filter(p => p.path).map(p => `${p.path}/package.json`)]
  for (const f of files) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    const h = createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12)
    sources.push({ kind: 'repo', ref: f, hash: h })
    all.update(`${f}:${h}`)
  }
  return { hash: all.digest('hex').slice(0, 16), sources }
}

export function probeContract(root: string, now: string): Contract {
  const { shape, packages } = collect(root)
  const main = packages.find(p => p.framework) ?? packages[0]
  const { hash, sources } = hashSources(root, packages)
  return {
    version: 1,
    generated: now,
    hash,
    shape,
    packageManager: main?.packageManager ?? detectPackageManager(root),
    monorepo: shape !== 'single',
    main: main?.path ?? '',
    packages,
    stack: stackPhrase(main, shape, packages.length, detectBundler(readPackageJson(main?.path ? join(root, main.path) : root))),
    commands: main?.commands ?? commandsFor(detectPackageManager(root), []),
    sources,
  }
}

export function packageForPath(contract: Contract, changed: string): PackageInfo | undefined {
  const candidatos = contract.packages
    .filter(p => p.path && changed.startsWith(`${p.path}/`))
    .sort((a, b) => b.path.length - a.path.length)
  return candidatos[0] ?? contract.packages.find(p => !p.path)
}
