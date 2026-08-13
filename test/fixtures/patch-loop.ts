import { existsSync } from 'node:fs'

const [, , cardsDir, id, field, times, barrier] = process.argv
process.env.HICODE_CARDS_DIR = cardsDir ?? ''

const { patchCard } = await import('../../lib/runner/card-store')

while (barrier && !existsSync(barrier)) await Bun.sleep(1)

const n = Number(times) || 1
for (let i = 0; i < n; i++) {
  patchCard(String(id), { [String(field)]: String(i) }, `${field} passo ${i}`)
}
