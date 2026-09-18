import { test, expect, beforeEach, afterEach } from 'bun:test'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { diagnosticarLocal, importarLocal, lerVinculo, pacoteLocal, agirNoVinculo } from '../panel/server/hii/recuperacao'
import { transition } from '../panel/server/card/acoes'
let dir = ''
let servidor: Server
let importar = 0
let existe = false
let perderResposta = false
let remoto = 'PAUSED'
let revisao = '"revisao-1"'
let anterior: NodeJS.ProcessEnv
const nome = '025-icones.md'
beforeEach(async () => {
  anterior = { ...process.env }
  dir = mkdtempSync(join(tmpdir(), 'hicode-recuperacao-'))
  process.env.HICODE_CARDS_DIR = join(dir, 'panel')
  mkdirSync(process.env.HICODE_CARDS_DIR)
  writeFileSync(join(process.env.HICODE_CARDS_DIR, nome), '---\r\nid: 025\r\nrepo: org/app\r\ntitle: Icones\r\nstatus: PAUSED\r\n---\r\nObjetivo e historico\r\n')
  for (const nome of ['020-a.md', '020-b.md']) writeFileSync(join(process.env.HICODE_CARDS_DIR, nome), '---\nid: 020\nrepo: org/app\ntitle: Nao tocar\nstatus: EXECUTING\n---\nOutro objetivo')
  importar = 0; existe = false; perderResposta = false; remoto = 'PAUSED'; revisao = '"revisao-1"'
  servidor = createServer(async (req, res) => {
    expect(req.headers.authorization).toBe('Bearer fixture-recuperacao-token-12345678901234567890')
    const partes: Buffer[] = []
    for await (const p of req) partes.push(Buffer.from(p))
    const b = partes.length ? JSON.parse(Buffer.concat(partes).toString()) as Record<string, unknown> : {}
    const pacote = pacoteLocal(nome)
    const hash = createHash('sha256').update(JSON.stringify(pacote)).digest('hex')
    const previa = { versao: 1, origem: pacote.origem, hash, tarefa: existe ? '101' : null, estado: existe ? 'vinculada' : 'importar', motivo: 'fixture', origemStatus: 'PAUSED', preservados: ['original'] }
    let resposta: object = previa
    if (req.url === '/v1/recuperacoes/importar') {
      importar++; existe = true
      expect(b.hash).toBe(hash)
      resposta = { ...previa, tarefa: '101', estado: 'vinculada' }
      if (perderResposta) { perderResposta = false; req.socket.destroy(); return }
    } else if (req.url === '/v1/tarefas/101/recuperacao') {
      resposta = { versao: 1, tarefa: '101', status: remoto, revisao, preparada: true, podePreparar: false,
        bloqueios: [], avisos: [], snapshots: [], motor: { estado: 'ligado', versao: 'fixture', motivo: '' } }
    } else if (req.url === '/v1/tarefas/101') resposta = { etag: revisao, campos: { id: '101', status: remoto, repo: 'org/app', recuperacao_origem: pacote.origem } }
    else if (req.url === '/v1/tarefas/101/acoes') {
      expect(req.headers['if-match']).toBe(revisao)
      remoto = b.acao === 'parar' ? 'HALTED' : 'EXECUTING'; revisao = '"revisao-2"'
      resposta = { ok: true }
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(resposta))
  })
  await new Promise<void>(resolve => servidor.listen(0, '127.0.0.1', resolve))
  const a = servidor.address()
  if (!a || typeof a === 'string') throw new Error('porta ausente')
  process.env.HII_API_URL = 'http://127.0.0.1:' + a.port
  process.env.HII_API_TOKEN = 'fixture-recuperacao-token-12345678901234567890'
})
afterEach(async () => {
  servidor.closeAllConnections()
  await new Promise<void>(resolve => servidor.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true }); process.env = anterior
})
test('diagnostico nao escreve; importacao por arquivo exato preserva #025 e IDs #020 duplicados', async () => {
  const fonte = join(process.env.HICODE_CARDS_DIR!, nome)
  const antes = readFileSync(fonte, 'utf8')
  const d = await diagnosticarLocal(nome)
  expect(lerVinculo(nome)).toBeNull()
  expect(importar).toBe(0)
  await importarLocal(nome, d.previa.hash)
  expect(lerVinculo(nome)?.estado).toBe('confirmado')
  expect(lerVinculo(nome)?.tarefa).toBe('101')
  expect(readFileSync(fonte, 'utf8')).toBe(antes)
  expect(() => transition('025', 'EXECUTING')).toThrow(/API/)
  expect(() => transition('020', 'EXECUTING')).toThrow(/ambiguo/)
  const campos = await agirNoVinculo(nome, 'retomar')
  expect(campos.status).toBe('EXECUTING')
  expect(readFileSync(fonte, 'utf8')).toBe(antes)
})
test('resposta perdida conserva intencao e reconcilia sem segunda importacao', async () => {
  const d = await diagnosticarLocal(nome)
  perderResposta = true
  await expect(importarLocal(nome, d.previa.hash)).rejects.toThrow(/confirmacao/)
  expect(lerVinculo(nome)?.estado).toBe('pendente')
  expect((await diagnosticarLocal(nome)).previa.tarefa).toBe('101')
  await importarLocal(nome, d.previa.hash)
  expect(importar).toBe(1)
  expect(lerVinculo(nome)?.estado).toBe('confirmado')
})
test('alteracao concorrente e tentativa de traversal nao escrevem vinculo', async () => {
  const d = await diagnosticarLocal(nome)
  const fonte = join(process.env.HICODE_CARDS_DIR!, nome)
  writeFileSync(fonte, readFileSync(fonte, 'utf8') + '\nMudanca humana')
  await expect(importarLocal(nome, d.previa.hash)).rejects.toThrow(/mudou/)
  expect(lerVinculo(nome)).toBeNull()
  expect(() => pacoteLocal('../' + nome)).toThrow()
  expect(importar).toBe(0)
})

test('vinculo corrompido fica restrito ao card e nao permite acao local', async () => {
  const { arquivoDoVinculo, estadoComVinculos } = await import('../panel/server/hii/recuperacao')
  const p = arquivoDoVinculo(nome)
  mkdirSync(join(process.env.HICODE_CARDS_DIR!, 'recuperacao'))
  writeFileSync(p, '{truncado')
  const card = { arquivo: nome, id: '025', slug: 'icones', title: 'Icones', status: 'PAUSED' as const, risk: 'low' as const, repo: 'org/app',
    updated: '', desc: '', cost_usd: '', cost_floor: '', cost_unverified: '', tokens_total: '', verify: '', revalidacao: '', preview_url: '', pr_url: '', shot: false, halt_reason: '', surface: '', eval_score: '', eval_notes: '' }
  const r = await estadoComVinculos({ cards: [card, { ...card, arquivo: '020-a.md', id: '020' }] })
  expect(r.cards).toHaveLength(2)
  expect(r.cards[0]!.halt_reason).toContain('sem confirmacao')
  expect(r.cards[1]!.halt_reason).toBe('')
  expect(() => transition('025', 'EXECUTING')).toThrow()
  expect(readFileSync(p, 'utf8')).toBe('{truncado')
})

test('identidade remota invalida no vinculo nao autoriza consulta nem acao', async () => {
  const { arquivoDoVinculo } = await import('../panel/server/hii/recuperacao')
  mkdirSync(join(process.env.HICODE_CARDS_DIR!, 'recuperacao'))
  writeFileSync(arquivoDoVinculo(nome), JSON.stringify({ versao: 1, origem: 'invalida', hash: 'a'.repeat(64), estado: 'confirmado', tarefa: '../configuracao', arquivo: nome }))
  expect(() => lerVinculo(nome)).toThrow(/inconsistente/)
})

test('pacote inclui plano e checkpoint de #025 sem anexar os de outro projeto ou tarefa', () => {
  const pasta = process.env.HICODE_CARDS_DIR!
  for (const sub of ['planos', 'orquestracao']) mkdirSync(join(pasta, sub))
  const chave = createHash('sha256').update('org/app').digest('hex').slice(0, 24)
  writeFileSync(join(pasta, 'planos', chave + '-025.json'), '{"versao":1}')
  writeFileSync(join(pasta, 'planos', 'outro-projeto-025.json'), 'nao anexar')
  writeFileSync(join(pasta, 'orquestracao', 'execucao-025-1.json'), '{"feitas":["A"]}')
  writeFileSync(join(pasta, 'orquestracao', 'execucao-020-1.json'), 'nao anexar')
  expect(pacoteLocal(nome).anexos.map(a => a.nome)).toEqual(['orquestracao/execucao-025-1.json', 'planos/' + chave + '-025.json'])
})
