import { test, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MAX_REDIRECTS } from '../lib/runner/redirect'
import { isBlockedHost, validateHttpUrl } from '../lib/runner/url-guard'
import { curlArgs, downloadToFile, parseHop } from '../lib/runner/download'
import { run } from '../lib/runner/git'
import { LOGO, METADADOS, METADADOS_GCP_PONTO, destino, movedTo, net, recusa, segue } from './fixtures/rede-falsa'

const CARDS = mkdtempSync(join(tmpdir(), 'hicode-refs-'))
process.env.HICODE_CARDS_DIR = CARDS

const { refPaths, resolveRefs } = await import('../lib/runner/refs')

afterAll(() => rmSync(CARDS, { recursive: true, force: true }))

test('redirect para o IP de metadados da nuvem e recusado e o salto nao chega a ser buscado', async () => {
  const n = net({ [LOGO]: movedTo(METADADOS) })
  const r = recusa(await segue(LOGO, n))
  expect(r.reason).toBe('host-bloqueado')
  expect(r.detail).toContain('169.254.169.254')
  expect(n.visitados).toEqual([LOGO])
})

test('Location relativo e resolvido contra a URL corrente e revalidado', async () => {
  const n = net({ [LOGO]: movedTo('/b/logo-final.png') })
  const r = destino(await segue(LOGO, n))
  expect(r.url).toBe('https://cdn.exemplo.com/b/logo-final.png')
  expect(r.redirects).toBe(1)
  expect(r.status).toBe(200)
  expect(n.visitados).toEqual([LOGO, 'https://cdn.exemplo.com/b/logo-final.png'])
})

test('Location relativo resolve contra o salto corrente, nao contra a URL original', async () => {
  const n = net({
    [LOGO]: movedTo('https://img.exemplo.com/x/'),
    'https://img.exemplo.com/x/': movedTo('final.png'),
  })
  const r = destino(await segue(LOGO, n))
  expect(r.url).toBe('https://img.exemplo.com/x/final.png')
  expect(r.redirects).toBe(2)
})

test('Location relativo ao protocolo ("//host") tambem passa pela blocklist', async () => {
  const n = net({ [LOGO]: movedTo('//169.254.169.254/latest/meta-data/') })
  const r = recusa(await segue(LOGO, n))
  expect(r.reason).toBe('host-bloqueado')
})

test('cada salto e validado, nao apenas o ultimo: desvio por rede interna no meio da cadeia e recusado', async () => {
  const n = net({
    [LOGO]: movedTo('http://10.0.0.5/pivot'),
    'http://10.0.0.5/pivot': movedTo('https://cdn.exemplo.com/b/logo-final.png'),
  })
  const r = recusa(await segue(LOGO, n))
  expect(r.reason).toBe('host-bloqueado')
  expect(r.detail).toContain('10.0.0.5')
  expect(n.visitados).toEqual([LOGO])
})

test('cadeia acima do teto de saltos e recusada', async () => {
  const n = net({
    'https://a.exemplo.com/0': movedTo('https://a.exemplo.com/1'),
    'https://a.exemplo.com/1': movedTo('https://a.exemplo.com/2'),
    'https://a.exemplo.com/2': movedTo('https://a.exemplo.com/3'),
    'https://a.exemplo.com/3': movedTo('https://a.exemplo.com/4'),
  })
  const r = recusa(await segue('https://a.exemplo.com/0', n))
  expect(r.reason).toBe('saltos-demais')
  expect(r.detail).toContain(String(MAX_REDIRECTS))
  expect(n.visitados).toEqual([
    'https://a.exemplo.com/0',
    'https://a.exemplo.com/1',
    'https://a.exemplo.com/2',
    'https://a.exemplo.com/3',
  ])
})

test('cadeia exatamente no teto ainda entrega o destino', async () => {
  const n = net({
    'https://a.exemplo.com/0': movedTo('https://a.exemplo.com/1'),
    'https://a.exemplo.com/1': movedTo('https://a.exemplo.com/2'),
    'https://a.exemplo.com/2': movedTo('https://a.exemplo.com/3'),
  })
  const r = destino(await segue('https://a.exemplo.com/0', n))
  expect(r.url).toBe('https://a.exemplo.com/3')
  expect(r.redirects).toBe(MAX_REDIRECTS)
})

test('URL legitima sem redirect continua funcionando', async () => {
  const n = net({})
  const r = destino(await segue(LOGO, n))
  expect(r.url).toBe(LOGO)
  expect(r.redirects).toBe(0)
  expect(n.visitados).toEqual([LOGO])
})

test('URL inicial em host bloqueado e recusada antes de qualquer requisicao', async () => {
  const n = net({})
  const r = recusa(await segue(METADADOS, n))
  expect(r.reason).toBe('host-bloqueado')
  expect(n.visitados).toEqual([])
})

test('Location com esquema fora de http(s) e recusado dizendo o motivo', async () => {
  const n = net({ [LOGO]: movedTo('file:///etc/passwd') })
  const r = recusa(await segue(LOGO, n))
  expect(r.reason).toBe('esquema-invalido')
  expect(r.detail).toContain('file:')
})

test('falha de transporte no meio da cadeia vira recusa explicita', async () => {
  const n = net({ [LOGO]: { status: 0, location: '', failed: true } })
  const r = recusa(await segue(LOGO, n))
  expect(r.reason).toBe('transporte-falhou')
})

test('3xx sem Location e resposta final, como no curl', async () => {
  const n = net({ [LOGO]: { status: 304, location: '', failed: false } })
  const r = destino(await segue(LOGO, n))
  expect(r.status).toBe(304)
  expect(r.redirects).toBe(0)
})

test('curl nao recebe -L: quem segue o redirect e o motor, preservando limites e saida em disco', () => {
  const args = curlArgs('https://cdn.exemplo.com/a.png', '/tmp/refs/ref-0.png', null)
  expect(args.join(' ')).not.toMatch(/(^|\s)-[a-zA-Z]*L\b/)
  expect(args).not.toContain('--location')
  expect(args).not.toContain('--resolve')
  expect(args[0]).toBe('-q')
  expect(args[args.indexOf('--max-filesize') + 1]).toBe('10485760')
  expect(args[args.indexOf('--max-time') + 1]).toBe('30')
  expect(args[args.indexOf('-o') + 1]).toBe('/tmp/refs/ref-0.png')
  expect(args[args.length - 1]).toBe('https://cdn.exemplo.com/a.png')
})

test('parseHop le status e Location do dump de cabecalhos', () => {
  const dump = 'HTTP/1.1 302 Found\r\nLocation: /b.png\r\nContent-Length: 0\r\n\r\n'
  expect(parseHop(dump, false)).toEqual({ status: 302, location: '/b.png', failed: false })
})

test('parseHop fica com o ultimo bloco de resposta e nao herda Location do bloco anterior', () => {
  const dump = 'HTTP/1.1 302 Found\r\nLocation: /x\r\n\r\nHTTP/2 200\r\nContent-Type: image/png\r\n\r\n'
  expect(parseHop(dump, false)).toEqual({ status: 200, location: '', failed: false })
})

test('blocklist cobre loopback, RFC1918, link-local, CGNAT e ULA', () => {
  for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.0.1', '169.254.169.254', '100.64.0.1', 'fd00::1', '[::1]']) {
    expect(isBlockedHost(h)).toBe(true)
  }
  expect(isBlockedHost('cdn.exemplo.com')).toBe(false)
  expect(validateHttpUrl('https://cdn.exemplo.com/a.png').ok).toBe(true)
})

test('REGRESSAO: IPv4 embutido em IPv6 e o endereco nao especificado tambem sao bloqueados', () => {
  for (const h of ['[::ffff:169.254.169.254]', '[::ffff:127.0.0.1]', '[::ffff:a9fe:a9fe]', '[::ffff:7f00:1]', '[0:0:0:0:0:ffff:7f00:1]', '[::7f00:1]', '[::]', '0:0:0:0:0:0:0:0']) {
    expect(isBlockedHost(h)).toBe(true)
  }
  expect(isBlockedHost('[::ffff:8.8.8.8]')).toBe(false)
  expect(isBlockedHost('[2001:4860:4860::8888]')).toBe(false)
})

test('REGRESSAO: new URL normaliza o mapeado, e a validacao continua recusando o host', () => {
  const r = validateHttpUrl('http://[::ffff:169.254.169.254]/latest/meta-data/')
  expect(r.ok).toBe(false)
  expect(r.ok ? '' : r.reason).toBe('host-bloqueado')
})

test('REGRESSAO: redirect para metadados da nuvem por IPv6 mapeado e recusado sem buscar o salto', async () => {
  const n = net({ [LOGO]: movedTo('http://[::ffff:169.254.169.254]/latest/meta-data/iam/security-credentials/') })
  const r = recusa(await segue(LOGO, n))
  expect(r.reason).toBe('host-bloqueado')
  expect(n.visitados).toEqual([LOGO])
})

test('REGRESSAO: redirect para loopback por IPv6 mapeado e recusado sem buscar o salto', async () => {
  const n = net({ [LOGO]: movedTo('http://[::ffff:127.0.0.1]/x') })
  const r = recusa(await segue(LOGO, n))
  expect(r.reason).toBe('host-bloqueado')
  expect(n.visitados).toEqual([LOGO])
})

test('REGRESSAO: o ponto final do DNS nao fura a blocklist por nome', () => {
  for (const h of ['metadata.google.internal.', 'localhost.', 'algo.localhost.', 'x.local.', 'metadata.google.internal..', '127.0.0.1.']) {
    expect(isBlockedHost(h)).toBe(true)
  }
  for (const h of ['::1%lo', 'fe80::1%eth0', '169.254.169.254%eth0']) {
    expect(isBlockedHost(h)).toBe(true)
  }
  expect(isBlockedHost('cdn.exemplo.com.')).toBe(false)
  const r = validateHttpUrl(METADADOS_GCP_PONTO)
  expect(r.ok).toBe(false)
  expect(r.ok ? '' : r.reason).toBe('host-bloqueado')
})

test('REGRESSAO: redirect para metadados com ponto final no host e recusado sem buscar o salto', async () => {
  const n = net({ [LOGO]: movedTo(METADADOS_GCP_PONTO) })
  const r = recusa(await segue(LOGO, n))
  expect(r.reason).toBe('host-bloqueado')
  expect(r.detail).toContain('metadata.google.internal.')
  expect(n.visitados).toEqual([LOGO])
})

test('REGRESSAO ponta a ponta: baixar de servico interno por IPv6 mapeado nao grava arquivo nenhum', async () => {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(): Response {
      return new Response('SEGREDO INTERNO', { status: 200 })
    },
  })
  const dest = join(CARDS, 'ref-mapeado.png')
  try {
    const r = await downloadToFile(`http://[::ffff:127.0.0.1]:${server.port}/segredo`, dest)
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.reason).toBe('host-bloqueado')
    expect(existsSync(dest)).toBe(false)
  } finally {
    server.stop(true)
  }
})

test('contra curl de verdade: 302 vira salto legivel e 200 grava o arquivo no destino', async () => {
  const server = Bun.serve({
    port: 0,
    fetch(req): Response {
      if (new URL(req.url).pathname === '/logo.png') {
        return new Response('', { status: 302, headers: { Location: '/final.png' } })
      }
      return new Response('PNGDATA', { status: 200 })
    },
  })
  const base = `http://127.0.0.1:${server.port}`
  const dest = join(CARDS, 'ref-real.png')
  try {
    const desvio = await run('curl', curlArgs(`${base}/logo.png`, dest, null), { timeout: 10000 })
    const salto = parseHop(String(desvio.stdout || ''), !!desvio.err)
    expect(salto.status).toBe(302)
    expect(salto.location).toBe('/final.png')

    const final = await run('curl', curlArgs(`${base}/final.png`, dest, null), { timeout: 10000 })
    const chegada = parseHop(String(final.stdout || ''), !!final.err)
    expect(chegada.status).toBe(200)
    expect(chegada.location).toBe('')
    expect(readFileSync(dest, 'utf8')).toBe('PNGDATA')
  } finally {
    server.stop(true)
  }
})

test('resolveRefs devolve o motivo da recusa em vez de engolir a fonte perigosa', async () => {
  mkdirSync(join(CARDS, 'refs'), { recursive: true })
  writeFileSync(join(CARDS, 'refs', '042.json'), JSON.stringify([METADADOS]))
  const outcomes = await resolveRefs('042')
  expect(outcomes.length).toBe(1)
  expect(outcomes[0]?.path).toBe('')
  expect(outcomes[0]?.refusal?.reason).toBe('host-bloqueado')
  expect(refPaths(outcomes)).toEqual([])
})

test('REGRESSAO: fonte sem esquema nao some calada — vira recusa dizendo que falta o http(s)', async () => {
  mkdirSync(join(CARDS, 'refs'), { recursive: true })
  writeFileSync(join(CARDS, 'refs', '077.json'), JSON.stringify(['www.figma.com/mockup.png']))
  const outcomes = await resolveRefs('077')
  expect(outcomes.length).toBe(1)
  expect(outcomes[0]?.source).toBe('www.figma.com/mockup.png')
  expect(outcomes[0]?.refusal?.reason).toBe('fonte-invalida')
  expect(outcomes[0]?.refusal?.detail).toContain('https://')
  expect(refPaths(outcomes)).toEqual([])
})

test('REGRESSAO: esquema em MAIUSCULA e tratado como URL, igual ao painel, em vez de virar caminho local', async () => {
  mkdirSync(join(CARDS, 'refs'), { recursive: true })
  writeFileSync(join(CARDS, 'refs', '078.json'), JSON.stringify(['HTTPS://CDN.NAO-EXISTE-MESMO.INVALID/logo.png']))
  const outcomes = await resolveRefs('078')
  expect(outcomes.length).toBe(1)
  expect(outcomes[0]?.refusal?.reason).toBe('dns-falhou')
  expect(outcomes[0]?.refusal?.detail).toContain('cdn.nao-existe-mesmo.invalid')
}, 30000)

test('REGRESSAO: arquivo local fora de cards/refs/<id> vira recusa explicita', async () => {
  mkdirSync(join(CARDS, 'refs'), { recursive: true })
  const fora = join(CARDS, 'mockup-do-designer.png')
  writeFileSync(fora, 'PNGDATA')
  writeFileSync(join(CARDS, 'refs', '079.json'), JSON.stringify([fora]))
  const outcomes = await resolveRefs('079')
  expect(outcomes[0]?.refusal?.reason).toBe('fonte-invalida')
  expect(outcomes[0]?.refusal?.detail).toContain('fora de cards/refs/079/')
})

test('REGRESSAO: toda fonte vira um RefOutcome — nenhuma desaparece antes do card', async () => {
  mkdirSync(join(CARDS, 'refs', '080'), { recursive: true })
  const dentro = join(CARDS, 'refs', '080', 'upload-1.png')
  writeFileSync(dentro, 'PNGDATA')
  const fontes = ['www.exemplo.com/logo.png', join(CARDS, 'sumiu.png'), 'file:///etc/passwd', dentro]
  writeFileSync(join(CARDS, 'refs', '080.json'), JSON.stringify(fontes))

  const outcomes = await resolveRefs('080')

  expect(outcomes.map(o => o.source)).toEqual(fontes)
  expect(outcomes.filter(o => o.refusal).length).toBe(3)
  expect(outcomes[2]?.refusal?.reason).toBe('esquema-invalido')
  expect(refPaths(outcomes)).toEqual([dentro])
})
