import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { listRepos } from './card-store'

const SEMPRE = ['claude', 'codex', 'ollama', 'gh', 'git', 'node', 'bun']
const RUIDO = new Set([
  'tem', 'acesso', 'ao', 'a', 'o', 'qual', 'quais', 'projeto', 'projetos', 'esta', 'estao',
  'configurado', 'configurada', 'instalado', 'instalada', 'the', 'para', 'com', 'de', 'do', 'da',
  'que', 'como', 'onde', 'existe', 'usa', 'usar', 'e', 'ou', 'no', 'na', 'em', 'me', 'referindo',
])

export function instalado(comando: string): boolean {
  const caminhos = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  return caminhos.some(dir => existsSync(join(dir, comando)))
}

export function candidatosNaPergunta(pergunta: string): string[] {
  const cru = pergunta.toLowerCase().match(/[a-z][a-z0-9._-]{1,30}/g) ?? []
  return [...new Set(cru)]
    .filter(p => !RUIDO.has(p))
    .filter(p => /-|cli|_/.test(p) || p.length >= 4)
    .slice(0, 12)
}

export function snapshotDoAmbiente(pergunta: string): string {
  const alvos = [...new Set([...SEMPRE, ...candidatosNaPergunta(pergunta)])]
  const linhas = alvos.map(c => `  ${c}: ${instalado(c) ? 'instalado' : 'NAO instalado'}`)
  const repos = listRepos().map(r => `  ${r.name} → ${r.path ?? '(sem caminho)'}`)
  return [
    'AMBIENTE DESTA MAQUINA (verificado agora pelo motor, nao suponha nada alem disto):',
    'comandos no PATH:',
    ...linhas,
    repos.length ? 'projetos registrados no hii:' : 'nenhum projeto registrado no hii',
    ...repos,
  ].join('\n')
}
