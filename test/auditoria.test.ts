import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  coberturaFecha,
  foraPorMotivo,
  LOTE_CHARS_DEFAULT,
  ordenarAchados,
  renderLote,
  resumoAuditoria,
  selecionarAuditoria,
  stemsDeTeste,
  temTesteCorrespondente,
  type AchadoAuditoria,
  type LoteAuditoria,
  type PlanoAuditoria,
} from '../lib/runner/auditoria'

const BASE = mkdtempSync(join(tmpdir(), 'hicode-auditoria-'))
process.env.HICODE_CARDS_DIR = join(BASE, 'cards')
mkdirSync(process.env.HICODE_CARDS_DIR, { recursive: true })

afterAll(() => rmSync(BASE, { recursive: true, force: true }))

type Arquivos = Record<string, string>

function plano(arquivos: Arquivos, orcamentoChars: number, maxLotes = 0): Promise<PlanoAuditoria> {
  const paths = Object.keys(arquivos)
  return selecionarAuditoria({
    orcamentoChars,
    maxLotes,
    listar: () => Promise.resolve(paths),
    ler: p => arquivos[p] ?? null,
  })
}

function corpo(linhas: number): string {
  return Array.from({ length: linhas }, (_, i) => `const valor${i} = ${i}`).join('\n')
}

function godFile(): string {
  const fns = Array.from({ length: 24 }, (_, i) => `function f${i}(): number { return ${i} }`).join('\n')
  return `export function unico(): number { return 1 }\n${fns}`
}

function caminhosAuditados(p: PlanoAuditoria): string[] {
  return p.lotes.flatMap(l => l.arquivos.map(a => a.path))
}

function primeiroLote(p: PlanoAuditoria): LoteAuditoria {
  const l = p.lotes[0]
  if (!l) throw new Error('plano sem lotes')
  return l
}

function repoComGitignore(): string {
  const dir = mkdtempSync(join(BASE, 'repo-'))
  execFileSync('git', ['init', '-q', dir])
  writeFileSync(join(dir, '.gitignore'), 'ignorado.ts\nnode_modules/\n')
  writeFileSync(join(dir, 'visivel.ts'), 'export const a = 1\n')
  writeFileSync(join(dir, 'ignorado.ts'), 'export const b = 2\n')
  mkdirSync(join(dir, 'node_modules', 'pacote'), { recursive: true })
  writeFileSync(join(dir, 'node_modules', 'pacote', 'index.js'), 'module.exports = 1\n')
  return dir
}

test('a selecao respeita .gitignore — arquivo ignorado nao entra nem como "ficou fora"', async () => {
  const dir = repoComGitignore()
  const p = await selecionarAuditoria({ raiz: dir, orcamentoChars: 10000 })
  expect(caminhosAuditados(p)).toContain('visivel.ts')
  const listados = [...caminhosAuditados(p), ...p.fora.map(f => f.path)]
  expect(listados).not.toContain('ignorado.ts')
  expect(listados.some(x => x.includes('node_modules'))).toBe(false)
  expect(coberturaFecha(p)).toBe(true)
})

test('a listagem sai de git ls-files (nao de caminhada no diretorio) com --exclude-standard', async () => {
  const binDir = join(BASE, 'bin')
  mkdirSync(binDir, { recursive: true })
  const argvFile = join(BASE, 'argv-git.txt')
  const fake = `#!/usr/bin/env bash
: > "$AUDIT_ARGV_FILE"
for a in "$@"; do printf '%s\\0' "$a" >> "$AUDIT_ARGV_FILE"; done
printf 'so-esse.ts\\0'
`
  const caminho = join(binDir, 'git')
  writeFileSync(caminho, fake)
  chmodSync(caminho, 0o755)
  const pathOriginal = process.env.PATH ?? ''
  process.env.AUDIT_ARGV_FILE = argvFile
  process.env.PATH = `${binDir}:${pathOriginal}`
  try {
    const p = await selecionarAuditoria({ raiz: BASE, orcamentoChars: 5000, ler: () => 'export const a = 1\n' })
    const argv = readFileSync(argvFile, 'utf8').split('\0').filter(s => s.length > 0)
    expect(argv[0]).toBe('ls-files')
    expect(argv).toContain('-z')
    expect(argv).toContain('--exclude-standard')
    expect(caminhosAuditados(p)).toEqual(['so-esse.ts'])
  } finally {
    process.env.PATH = pathOriginal
    delete process.env.AUDIT_ARGV_FILE
  }
})

test('nenhum lote passa do orcamento de caracteres', async () => {
  const arquivos: Arquivos = {}
  for (let i = 0; i < 30; i++) arquivos[`lib/m${String(i).padStart(2, '0')}.ts`] = corpo(40)
  const p = await plano(arquivos, 900)
  expect(p.lotes.length).toBeGreaterThan(1)
  for (const l of p.lotes) expect(l.chars).toBeLessThanOrEqual(900)
  expect(p.totalAuditado).toBe(30)
  expect(coberturaFecha(p)).toBe(true)
})

test('ordem de risco: god-file e arquivo grande vem antes do arquivo pequeno', async () => {
  const arquivos: Arquivos = {
    'lib/pequeno.ts': 'export const a = 1\n',
    'test/pequeno.test.ts': 'import "../lib/pequeno"\n',
    'lib/grande.ts': corpo(420),
    'test/grande.test.ts': 'import "../lib/grande"\n',
    'lib/deus.ts': godFile(),
    'test/deus.test.ts': 'import "../lib/deus"\n',
  }
  const p = await plano(arquivos, 200000)
  const ordem = caminhosAuditados(p)
  expect(ordem.slice(0, 2)).toEqual(['lib/grande.ts', 'lib/deus.ts'])
  expect(ordem.indexOf('lib/pequeno.ts')).toBeGreaterThan(ordem.indexOf('lib/deus.ts'))
  const deus = primeiroLote(p).arquivos.find(a => a.path === 'lib/deus.ts')
  expect(deus?.godFile).toBe(true)
  expect(deus?.motivos.join(' ')).toContain('god-file')
  const grande = primeiroLote(p).arquivos.find(a => a.path === 'lib/grande.ts')
  expect(grande?.excedeLinhas).toBe(true)
})

test('arquivo sem teste correspondente sobe na ordem', async () => {
  const arquivos: Arquivos = {
    'lib/com-teste.ts': corpo(100),
    'test/com-teste.test.ts': 'import "../lib/com-teste"\n',
    'lib/sem-teste.ts': corpo(100),
  }
  const p = await plano(arquivos, 200000)
  const ordem = caminhosAuditados(p)
  expect(ordem.indexOf('lib/sem-teste.ts')).toBeLessThan(ordem.indexOf('lib/com-teste.ts'))
  const sem = primeiroLote(p).arquivos.find(a => a.path === 'lib/sem-teste.ts')
  expect(sem?.semTeste).toBe(true)
  expect(sem?.motivos).toContain('sem teste correspondente')
  const com = primeiroLote(p).arquivos.find(a => a.path === 'lib/com-teste.ts')
  expect(com?.semTeste).toBe(false)
})

test('stem de teste casa com o fonte por nome, inclusive com sufixo', () => {
  const stems = stemsDeTeste(['test/card-store.test.ts', 'test/finish-cost.test.ts', 'lib/runner/finish.ts'])
  expect(temTesteCorrespondente('lib/runner/card-store.ts', stems)).toBe(true)
  expect(temTesteCorrespondente('lib/runner/finish.ts', stems)).toBe(true)
  expect(temTesteCorrespondente('lib/runner/preview.ts', stems)).toBe(false)
  expect(temTesteCorrespondente('test/card-store.test.ts', stems)).toBe(true)
})

test('REGRESSAO escopo recorta o que e auditado, mas a deteccao de teste ainda ve o repo inteiro', async () => {
  const arquivos: Arquivos = {
    'lib/runner/com-teste.ts': corpo(100),
    'lib/runner/sem-teste.ts': corpo(100),
    'test/com-teste.test.ts': 'import "../lib/runner/com-teste"\n',
  }
  const paths = Object.keys(arquivos)
  const p = await selecionarAuditoria({
    orcamentoChars: 200000,
    escopo: 'lib/runner/',
    listar: () => Promise.resolve(paths),
    ler: f => arquivos[f] ?? null,
  })
  expect(p.totalListado).toBe(2)
  expect(caminhosAuditados(p)).toEqual(['lib/runner/sem-teste.ts', 'lib/runner/com-teste.ts'])
  const com = primeiroLote(p).arquivos.find(a => a.path === 'lib/runner/com-teste.ts')
  expect(com?.semTeste).toBe(false)
  expect(coberturaFecha(p)).toBe(true)
  expect(resumoAuditoria(p)).toContain('escopo: lib/runner/')
})

test('repo vazio nao quebra', async () => {
  const p = await plano({}, 5000)
  expect(p.lotes).toEqual([])
  expect(p.fora).toEqual([])
  expect(p.totalListado).toBe(0)
  expect(p.totalAuditado).toBe(0)
  expect(coberturaFecha(p)).toBe(true)
  expect(resumoAuditoria(p)).toContain('0 de 0 arquivo(s)')
})

test('arquivo unico maior que o orcamento aparece como "ficou fora" com motivo', async () => {
  const gigante = corpo(500)
  const p = await plano({ 'lib/gigante.ts': gigante, 'lib/ok.ts': 'export const a = 1\n' }, 300)
  const fora = p.fora.find(f => f.path === 'lib/gigante.ts')
  expect(fora?.motivo).toBe('maior-que-o-lote')
  expect(fora?.detalhe).toContain(String(gigante.length))
  expect(fora?.detalhe).toContain('300')
  expect(caminhosAuditados(p)).toEqual(['lib/ok.ts'])
  expect(resumoAuditoria(p)).toContain('lib/gigante.ts')
  expect(coberturaFecha(p)).toBe(true)
})

test('o que entrou mais o que ficou fora fecha com o total listado', async () => {
  const arquivos: Arquivos = {
    'lib/a.ts': corpo(60),
    'lib/b.vue': '<template><div/></template><script setup lang="ts">export const x = 1</script>',
    'scripts/deploy.sh': 'echo oi',
    'docs/leia.md': '# titulo',
    'config/repos.json': '{}',
    'infra/main.tf': 'resource "x" "y" {}',
    'node_modules/p/index.js': 'module.exports = 1',
    'lib/vazio.ts': '   \n',
    'lib/tipos.d.ts': 'export declare const z: number',
    'lib/gigante.ts': corpo(600),
  }
  const p = await plano(arquivos, 4000)
  expect(p.totalListado).toBe(10)
  expect(p.totalAuditado + p.fora.length).toBe(10)
  expect(coberturaFecha(p)).toBe(true)
  for (const f of p.fora) {
    expect(f.motivo.length).toBeGreaterThan(0)
    expect(f.detalhe.length).toBeGreaterThan(0)
  }
  const grupos = new Map(foraPorMotivo(p).map(g => [g.motivo, g.quantidade]))
  expect(grupos.get('extensao-nao-auditavel')).toBe(5)
  expect(grupos.get('diretorio-gerado')).toBe(1)
  expect(grupos.get('arquivo-vazio')).toBe(1)
  expect(grupos.get('maior-que-o-lote')).toBe(1)
  expect(caminhosAuditados(p).sort()).toEqual(['lib/a.ts', 'lib/b.vue'])
  const vue = primeiroLote(p).arquivos.find(a => a.path === 'lib/b.vue')
  expect(vue?.linhas).toBe(1)
})

test('limite de lotes corta com motivo declarado, nunca em silencio', async () => {
  const arquivos: Arquivos = {}
  for (let i = 0; i < 12; i++) arquivos[`lib/m${String(i).padStart(2, '0')}.ts`] = corpo(40)
  const p = await plano(arquivos, 900, 2)
  expect(p.lotes.length).toBe(2)
  const cortados = p.fora.filter(f => f.motivo === 'acima-do-limite-de-lotes')
  expect(cortados.length).toBe(12 - p.totalAuditado)
  expect(cortados.length).toBeGreaterThan(0)
  expect(cortados[0]?.detalhe).toContain('2 lote')
  expect(coberturaFecha(p)).toBe(true)
})

test('o resumo declara cobertura e o lote se renderiza com risco e motivo', async () => {
  const p = await plano({ 'lib/deus.ts': godFile(), 'docs/x.md': '# nada' }, 5000)
  const texto = resumoAuditoria(p)
  expect(texto).toContain('auditoria manual: 1 de 2 arquivo(s) em 1 lote(s)')
  expect(texto).toContain('fora (1)')
  expect(texto).toContain('docs/x.md')
  const render = renderLote(primeiroLote(p), p.lotes.length)
  expect(render).toContain('LOTE 1/1')
  expect(render).toContain('lib/deus.ts')
  expect(render).toContain('risco ')
  expect(render).toContain('god-file')
})

test('REGRESSAO caminho com espaco no nome nao e mutilado nem colide com outro arquivo', async () => {
  const arquivos: Arquivos = {
    ' lib/x.ts': 'export const comEspacoNaFrente = 1',
    'lib/x.ts': 'export const semEspaco = 2',
    'lib/y.ts ': 'export const comEspacoAtras = 3',
    'lib/acentuado é.ts': 'export const acento = 4',
  }
  const p = await plano(arquivos, 5000)
  expect(p.totalListado).toBe(4)
  expect(caminhosAuditados(p).sort()).toEqual([' lib/x.ts', 'lib/acentuado é.ts', 'lib/x.ts'])
  expect(p.fora.map(f => f.path)).toEqual(['lib/y.ts '])
  expect(p.fora[0]?.motivo).toBe('extensao-nao-auditavel')
  expect(coberturaFecha(p)).toBe(true)
})

test('REGRESSAO orcamento invalido cai no default em vez de anular o limite', async () => {
  const arquivos: Arquivos = {}
  for (let i = 0; i < 4; i++) arquivos[`lib/g${i}.ts`] = corpo(2000)
  for (const invalido of [Number('abc'), 0, -5, Infinity]) {
    const p = await selecionarAuditoria({
      orcamentoChars: invalido,
      listar: () => Promise.resolve(Object.keys(arquivos)),
      ler: f => arquivos[f] ?? null,
    })
    expect(Number.isFinite(p.orcamentoChars)).toBe(true)
    expect(p.orcamentoChars).toBe(LOTE_CHARS_DEFAULT)
    for (const l of p.lotes) expect(l.chars).toBeLessThanOrEqual(p.orcamentoChars)
    expect(coberturaFecha(p)).toBe(true)
  }
})

test('REGRESSAO monolito sancionado por hicode:allow-monolith perde para violacao real', async () => {
  const arquivos: Arquivos = {
    'lib/assumido.ts': `// hicode:allow-monolith\n${corpo(400)}`,
    'lib/violador.ts': corpo(360),
  }
  const p = await plano(arquivos, 200000)
  expect(caminhosAuditados(p)).toEqual(['lib/violador.ts', 'lib/assumido.ts'])
  const assumido = primeiroLote(p).arquivos.find(a => a.path === 'lib/assumido.ts')
  expect(assumido?.excedeLinhas).toBe(true)
  expect(assumido?.motivos.join(' ')).toContain('hicode:allow-monolith')
})

test('REGRESSAO recorte que nao casa com nada grita em vez de declarar cobertura', async () => {
  const p = await selecionarAuditoria({
    orcamentoChars: 5000,
    escopo: 'lib/runer/',
    listar: () => Promise.resolve(['lib/runner/a.ts', 'lib/runner/b.ts']),
    ler: () => 'export const a = 1',
  })
  expect(p.totalListado).toBe(0)
  expect(p.lotes).toEqual([])
  expect(resumoAuditoria(p)).toContain('ATENCAO: o recorte lib/runer/ nao casou com nenhum arquivo')
})

test('god-file exige exports: modulo python com muitas funcoes nao e acusado', async () => {
  const defs = Array.from({ length: 25 }, (_, i) => `def f${i}():\n    return ${i}`).join('\n')
  const p = await plano({ 'app/servico.py': defs }, 200000)
  const py = primeiroLote(p).arquivos.find(a => a.path === 'app/servico.py')
  expect(py?.funcoes).toBe(25)
  expect(py?.godFile).toBe(false)
  expect(py?.motivos.join(' ')).not.toContain('god-file')
})

test('achados saem ordenados por gravidade', () => {
  const achados: AchadoAuditoria[] = [
    { path: 'b.ts', gravidade: 'baixa', resumo: 'estilo', lote: 1 },
    { path: 'a.ts', gravidade: 'alta', resumo: 'erro silenciado', lote: 2, linha: 10 },
    { path: 'c.ts', gravidade: 'media', resumo: 'acoplamento', lote: 1 },
    { path: 'a.ts', gravidade: 'alta', resumo: 'tipo frouxo', lote: 1, linha: 3 },
  ]
  const ordem = ordenarAchados(achados).map(a => `${a.gravidade}:${a.path}:${a.linha ?? 0}`)
  expect(ordem).toEqual(['alta:a.ts:3', 'alta:a.ts:10', 'media:c.ts:0', 'baixa:b.ts:0'])
})
