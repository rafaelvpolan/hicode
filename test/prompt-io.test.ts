import { test, expect, beforeEach } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handle, newSession, comConversa } from '../lib/core/session'
import { dispatch } from '../lib/core/dispatch'
import { dispatchIOFalso } from './fixtures/dispatch-io-falso'
import { classificarPrompt, continuaConversa } from '../lib/core/classificar'
import { lerEntrada } from '../lib/core/tipo-de-prompt'
import { allCards } from '../lib/runner/card-store'

beforeEach(() => {
  process.env.HICODE_CARDS_DIR = mkdtempSync(join(tmpdir(), 'hicode-io-'))
  delete process.env.HICODE_CLASSIFY
})

async function entrar(texto: string, conversa: { pergunta: string; resposta: string }[] = []) {
  const saida: string[] = []
  let state = newSession('org/app')
  for (const t of conversa) state = comConversa(state, t.pergunta, t.resposta)
  const antes = allCards().length
  const r = handle(texto, state)
  const d = await dispatch(r.effect, r.state, dispatchIOFalso({
    log: (l) => { saida.push(l) },
    responder: async () => ['  resposta fictícia'],
    plano: async () => ['  PLANO'],
  }))
  return { saida: saida.join(' '), criouCard: allCards().length > antes, state: d.state }
}

test('IO: pergunta digitada direto e RESPONDIDA, sem criar card e sem exigir prefixo', async () => {
  const r = await entrar('tem acesso ao ntn-cli? qual projeto esta configurado?')
  expect(r.criouCard).toBe(false)
  expect(r.saida).toContain('lido como pergunta')
  expect(r.saida).toContain('resposta fictícia')
  expect(r.saida).toContain('/new-task')
})

test('IO: a pergunta respondida direto tambem entra na memoria da conversa', async () => {
  const r = await entrar('qual modelo o gate usa?')
  expect(r.state.conversa.length).toBe(1)
})

test('IO REGRESSAO: continuacao de conversa NAO vira tarefa', async () => {
  const conversa = [{ pergunta: 'tem acesso ao ntn-cli?', resposta: 'nao esta instalado' }]
  const r = await entrar('estou me referindo ao notion cli', conversa)
  expect(r.criouCard).toBe(false)
  expect(r.saida).toContain('continua a conversa')
})

test('IO: a mesma frase SEM conversa anterior vira tarefa (nao ha o que continuar)', async () => {
  const r = await entrar('estou me referindo ao notion cli')
  expect(r.criouCard).toBe(true)
})

test('IO: pedido de mudanca cria card e mostra plano', async () => {
  const r = await entrar('remove o selo beta do header')
  expect(r.criouCard).toBe(true)
  expect(r.saida).toContain('criado')
  expect(r.saida).toContain('PLANO')
})

test('IO: /new-ask responde e guarda a troca na conversa', async () => {
  const r = await entrar('/new-ask tem ollama instalado?')
  expect(r.criouCard).toBe(false)
  expect(r.state.conversa.length).toBe(1)
  expect(r.state.conversa[0]?.pergunta).toContain('ollama')
})

test('IO: /new-task ignora a leitura e cria mesmo sendo pergunta', async () => {
  const r = await entrar('/new-task tem acesso ao ntn?')
  expect(r.criouCard).toBe(true)
})

test('IO: a conversa nao cresce sem limite', () => {
  let s = newSession('org/app')
  for (let i = 0; i < 20; i++) s = comConversa(s, `p${i}`, `r${i}`)
  expect(s.conversa.length).toBeLessThanOrEqual(6)
  expect(s.conversa[s.conversa.length - 1]?.pergunta).toBe('p19')
})

test('continuacao so conta com conversa previa', () => {
  expect(continuaConversa('estou me referindo ao notion', [])).toBe(false)
  expect(continuaConversa('estou me referindo ao notion', [{ pergunta: 'x', resposta: 'y' }])).toBe(true)
})

const CASOS: [string, 'task' | 'ask'][] = [
  ['tem acesso ao ntn-cli? qual projeto esta configurado?', 'ask'],
  ['qual modelo o gate usa?', 'ask'],
  ['como funciona o worktree?', 'ask'],
  ['e possivel usar dois provedores ao mesmo tempo?', 'ask'],
  ['da pra ver o preview sem subir o daemon?', 'ask'],
  ['voce sabe se o push passou?', 'ask'],
  ['por que o card 22 parou?', 'ask'],
  ['remove o selo beta do header', 'task'],
  ['Coloque botao voltar ao topo', 'task'],
  ['Aplique SEO no site inteiro', 'task'],
  ['Melhore o card de apoio', 'task'],
  ['Renomeie o componente Header', 'task'],
  ['Corrija o build quebrado', 'task'],
  ['pode remover o selo beta?', 'task'],
  ['quero atualizar o vite', 'task'],
  ['o rodape esta desalinhado no mobile', 'task'],
  ['erro 500 na home depois do deploy', 'task'],
  ['Selo beta no topo', 'task'],
  ['Banner de versao de testes', 'task'],
]

test('IO: bateria de 19 entradas reais sai no tipo certo', async () => {
  const erros: string[] = []
  for (const [texto, esperado] of CASOS) {
    const l = await classificarPrompt(texto)
    if (l.tipo !== esperado) erros.push(`"${texto}" → ${l.tipo}, esperado ${esperado}`)
  }
  expect(erros).toEqual([])
})

test('IO: nenhuma entrada da bateria fica sem motivo legivel', () => {
  for (const [texto] of CASOS) {
    const l = lerEntrada(texto)
    expect(l.motivo.length, texto).toBeGreaterThan(8)
    expect(['alta', 'baixa'], texto).toContain(l.confianca)
  }
})

test('IO REGRESSAO: "tem X instalado" e respondivel — o motor entrega o fato, nao a IA adivinha', async () => {
  const { writeFileSync } = await import('node:fs')
  const registro = join(mkdtempSync(join(tmpdir(), 'hicode-repos-io-')), 'repos.json')
  writeFileSync(registro, JSON.stringify([{ name: 'acme/site', path: '/tmp/acme-site' }]))
  process.env.HICODE_REPOS_FILE = registro

  const { snapshotDoAmbiente } = await import('../lib/runner/ambiente')
  const s = snapshotDoAmbiente('tem acesso ao ntn-cli? qual projeto esta configurado?')
  expect(s).toContain('ntn-cli')
  expect(s).toMatch(/ntn-cli: (NAO )?instalado/)
  expect(s).toContain('projetos registrados')
  expect(s).toContain('acme/site')
  delete process.env.HICODE_REPOS_FILE
})

test('IO: o snapshot sempre cobre os CLIs que o motor usa', async () => {
  const { snapshotDoAmbiente } = await import('../lib/runner/ambiente')
  const s = snapshotDoAmbiente('pergunta qualquer')
  for (const c of ['claude', 'codex', 'ollama', 'gh', 'git']) expect(s, c).toContain(c)
})

test('IO: candidatos vem da pergunta, sem ruido de artigo e preposicao', async () => {
  const { candidatosNaPergunta } = await import('../lib/runner/ambiente')
  const c = candidatosNaPergunta('tem acesso ao ntn-cli e ao docker-compose?')
  expect(c).toContain('ntn-cli')
  expect(c).toContain('docker-compose')
  expect(c).not.toContain('ao')
  expect(c).not.toContain('tem')
})

test('IO: o snapshot nao inventa — quem nao esta no PATH sai como NAO instalado', async () => {
  const { snapshotDoAmbiente, instalado } = await import('../lib/runner/ambiente')
  expect(instalado('binario-que-nao-existe-12345')).toBe(false)
  expect(snapshotDoAmbiente('tem binario-que-nao-existe-12345?')).toContain('binario-que-nao-existe-12345: NAO instalado')
})

test('REGRESSAO: pergunta com radical de acao como substantivo nao vira card', () => {
  for (const p of [
    'o projeto tem teste de e2e?',
    'esse repo tem documentacao?',
    'o card 22 ja passou pela revisao?',
    'a migracao do schema ja rodou?',
    'onde fica o teste de layout?',
  ]) {
    const r = lerEntrada(p)
    expect(r.tipo).toBe('ask')
    expect(r.confianca).toBe('alta')
  }
})

test('pedido no imperativo com ? no fim continua sendo tarefa', () => {
  expect(lerEntrada('pode criar a pagina de login?').tipo).toBe('task')
  expect(lerEntrada('cria a pagina de login?').tipo).toBe('task')
})
