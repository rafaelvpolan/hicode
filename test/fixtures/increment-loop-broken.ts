import { existsSync } from 'node:fs'

const [, , cardsDir, id, field, times, barrier] = process.argv
process.env.HICODE_CARDS_DIR = cardsDir ?? ''

const { readCard, patchCard } = await import('../../lib/runner/card-store')

while (barrier && !existsSync(barrier)) await Bun.sleep(1)

const n = Number(times) || 1
for (let i = 0; i < n; i++) {
  const atual = Number(readCard(String(id))?.fm[String(field)] || '0') || 0
  patchCard(String(id), { [String(field)]: String(atual + 1) })
}
