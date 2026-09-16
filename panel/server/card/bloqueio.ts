import { openSync, closeSync, unlinkSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'

const waitBuffer = new Int32Array(new SharedArrayBuffer(4))
interface Dono { versao: 1; pid: number; host: string; token: string }
interface ErroDeSistema { code?: string }

function lerDono(lock: string): Dono | null {
  try {
    const d = JSON.parse(readFileSync(lock, 'utf8')) as Dono
    return d?.versao === 1 && Number.isInteger(d.pid) && d.pid > 0 && typeof d.host === 'string' && typeof d.token === 'string' ? d : null
  } catch { return null }
}
function morto(d: Dono): boolean {
  if (d.host !== hostname()) return false
  try { process.kill(d.pid, 0); return false }
  catch (e) { return (e as ErroDeSistema).code === 'ESRCH' }
}
function liberar(lock: string, token: string): void {
  if (lerDono(lock)?.token !== token) return
  try { unlinkSync(lock) } catch (e) { if ((e as ErroDeSistema).code !== 'ENOENT') throw e }
}
function criar(lock: string, dono: Dono): void {
  const fd = openSync(lock, 'wx', 0o600)
  try { writeFileSync(fd, JSON.stringify(dono)) } finally { closeSync(fd) }
}
function recuperar(lock: string, dono: Dono): void {
  const anterior = lerDono(lock)
  if (!anterior || !morto(anterior)) return
  // Serializa recuperadores: nenhum deles pode apagar o lock de um novo dono.
  const guarda = `${lock}.recuperacao`
  try { criar(guarda, dono) }
  catch (e) { if ((e as ErroDeSistema).code === 'EEXIST') return; throw e }
  try {
    const atual = lerDono(lock)
    if (atual?.token === anterior.token && morto(atual)) liberar(lock, atual.token)
  } finally { liberar(guarda, dono.token) }
}
function adquirir(lock: string): Dono {
  const dono: Dono = { versao: 1, pid: process.pid, host: hostname(), token: randomUUID() }
  const inicio = Date.now()
  const configurado = Number(process.env.HICODE_LOCK_TIMEOUT_MS ?? 10000)
  const timeout = Number.isFinite(configurado) && configurado >= 0 ? configurado : 10000
  for (;;) {
    try { criar(lock, dono); return dono }
    catch (e) { if ((e as ErroDeSistema).code !== 'EEXIST') throw e }
    recuperar(lock, dono)
    if (Date.now() - inicio >= timeout) throw new Error(`lock ocupado ou dono nao verificavel: ${lock}; nenhum lock ativo foi removido`)
    Atomics.wait(waitBuffer, 0, 0, 2)
  }
}
export function withFileLock<T>(target: string, fn: () => T): T {
  const lock = `${target}.lock`
  const dono = adquirir(lock)
  try { return fn() } finally { liberar(lock, dono.token) }
}
export function writeFileAtomic(file: string, content: string): void {
  const tmp = `${file}.tmp.${process.pid}.${randomUUID()}`
  try {
    writeFileSync(tmp, content)
    renameSync(tmp, file)
  } finally {
    try { unlinkSync(tmp) } catch (e) { if ((e as ErroDeSistema).code !== 'ENOENT') throw e }
  }
}
