// Fixtures mudam env e caminhos de estado. Cache de modulos nao pode atravessar arquivos.
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
function arquivos(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? arquivos(join(dir, e.name)) : e.name.endsWith('.test.ts') ? [join(dir, e.name)] : []).sort() }
let falhas = 0, passaram = 0, pulados = 0
const testes = arquivos('test')
for (const teste of testes) {
  const r = spawnSync('bun', ['test', teste], { encoding: 'utf8', timeout: 60000 })
  const saida = `${r.stdout || ''}${r.stderr || ''}`
  passaram += Number(saida.match(/^\s*(\d+) pass$/m)?.[1] || 0)
  pulados += Number(saida.match(/^\s*(\d+) skip$/m)?.[1] || 0)
  if (r.status !== 0) { falhas++; console.error(`\n${teste}\n${saida}\n${r.error?.message || ''}`) }
  else process.stdout.write('.')
}
console.log(`\n${testes.length} arquivos isolados; ${passaram} passaram; ${pulados} pulados; ${falhas} arquivos com falha`)
process.exitCode = falhas ? 1 : 0
