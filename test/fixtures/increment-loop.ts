import { existsSync } from 'node:fs'

const [, , cardsDir, id, field, times, barrier] = process.argv
process.env.HICODE_CARDS_DIR = cardsDir ?? ''

const { patchCardWith } = await import('../../lib/runner/card-store')

while (barrier && !existsSync(barrier)) await Bun.sleep(1)

const n = Number(times) || 1
for (let i = 0; i < n; i++) {
  patchCardWith(String(id), (fm) => ({ [String(field)]: String((Number(fm[String(field)] || '0') || 0) + 1) }))
}
