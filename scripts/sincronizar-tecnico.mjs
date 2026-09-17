import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const checkout = process.env.HII_TEST_CHECKOUT
if (!checkout) throw new Error('Informe HII_TEST_CHECKOUT com o checkout HII revisado')
const contratos = [
  ['motor/oswaldo/orquestracao/tecnico.ts', 'panel/shared/contrato-tecnico.ts'],
  ['motor/api/avaliacao-contrato.ts', 'panel/shared/avaliacao-hii.ts'],
]
for (const [origem, destino] of contratos) {
  const fonte = readFileSync(resolve(checkout, origem), 'utf8')
  const conteudo = '// Gerado de hii/' + origem + '; use scripts/sincronizar-tecnico.mjs.\n' + fonte
  if (process.argv.includes('--check')) {
    if (readFileSync(resolve(destino), 'utf8') !== conteudo) throw new Error('Contrato divergente: ' + destino)
  } else writeFileSync(resolve(destino), conteudo)
}
