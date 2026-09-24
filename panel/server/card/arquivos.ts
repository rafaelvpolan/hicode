import { readdirSync, existsSync } from 'node:fs'
import { cardsDir } from '../motor/ambiente'

export function cardFiles(): string[] {
  return existsSync(cardsDir()) ? readdirSync(cardsDir()).filter(f => f.endsWith('.md')) : []
}

export function normalizeId(id: string): string {
  const bruto = String(id ?? '').trim()
  if (!/^\d+$/.test(bruto)) return bruto
  return String(Number(bruto)).padStart(3, '0')
}

export function findCardFile(id: string): string | null {
  const alvo = normalizeId(id)
  const encontrados = cardFiles().filter(f => f.startsWith(`${alvo}-`))
  if (encontrados.length > 1) throw new Error('ID de tarefa ambiguo: ' + alvo + '; selecione o arquivo de origem antes de recuperar')
  return encontrados[0] || null
}
