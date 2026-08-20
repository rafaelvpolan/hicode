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
  return cardFiles().find(f => f.startsWith(`${alvo}-`)) || null
}
