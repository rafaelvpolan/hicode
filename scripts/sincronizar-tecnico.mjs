import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const checkout = process.env.HII_TEST_CHECKOUT
if (!checkout) throw new Error('Informe HII_TEST_CHECKOUT com o checkout HII revisado')
const fonte = readFileSync(resolve(checkout, 'motor/oswaldo/orquestracao/tecnico.ts'), 'utf8')
const destino = resolve('panel/shared/contrato-tecnico.ts')
const conteudo = '// Gerado de hii/motor/oswaldo/orquestracao/tecnico.ts; use scripts/sincronizar-tecnico.mjs.\n' + fonte
if (process.argv.includes('--check')) {
  if (readFileSync(destino, 'utf8') !== conteudo) throw new Error('Contrato tecnico divergente; sincronize antes de publicar')
} else writeFileSync(destino, conteudo)
