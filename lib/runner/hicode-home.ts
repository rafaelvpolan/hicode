import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface ProjectConfig {
  provider?: string
  base?: string
  taskSource?: string
}

export function hicodeHome(repo: string): string {
  return join(repo, '.hicode')
}

export function readProjectConfig(repo: string): ProjectConfig {
  const f = join(hicodeHome(repo), 'config.json')
  if (!existsSync(f)) return {}
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as ProjectConfig
  } catch {
    return {}
  }
}

export function readProjectRules(repo: string): string {
  const f = join(hicodeHome(repo), 'rules.md')
  if (!existsSync(f)) return ''
  try {
    return readFileSync(f, 'utf8').trim().slice(0, 4000)
  } catch {
    return ''
  }
}

const DEFAULT_CONFIG: ProjectConfig = { provider: 'claude', base: 'main', taskSource: 'cards' }

const DEFAULT_RULES = `# Regras do projeto para o motor hicode

Estas regras sao ADITIVAS ao CLAUDE.md do repositorio; nunca o substituem.
Escreva aqui, curto, o que o motor precisa saber deste projeto (stack, convencoes,
o que nunca mexer). Quanto mais curto, menos tokens por card.
`

export function initHicodeHome(repo: string): string[] {
  const home = hicodeHome(repo)
  const created: string[] = []
  for (const d of [home, join(home, 'memory'), join(home, 'skills'), join(home, 'state')]) {
    if (!existsSync(d)) { mkdirSync(d, { recursive: true }); created.push(d) }
  }
  const files: Array<[string, string]> = [
    [join(home, 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n'],
    [join(home, 'rules.md'), DEFAULT_RULES],
    [join(home, '.gitignore'), 'state/\n'],
  ]
  for (const [f, content] of files) {
    if (!existsSync(f)) { writeFileSync(f, content); created.push(f) }
  }
  return created
}
