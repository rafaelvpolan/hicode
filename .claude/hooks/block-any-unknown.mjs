#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { ALLOW, TS_EXT, findViolations } from '../../scripts/no-any-detect.mjs'

function newTexts(tool, input) {
  if (tool === 'Write') return [input.content || '']
  if (tool === 'Edit') return [input.new_string || '']
  if (tool === 'MultiEdit') return (input.edits || []).map(e => e.new_string || '')
  return []
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', d => raw += d)
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(raw)
    const tool = ev.tool_name
    const input = ev.tool_input || {}
    const path = input.file_path || ''
    const ext = (path.split('.').pop() || '').toLowerCase()
    if (!TS_EXT.has(ext)) process.exit(0)

    let whole = ''
    try { whole = readFileSync(path, 'utf8') } catch { whole = '' }
    if (ALLOW.test(whole)) process.exit(0)

    const hits = newTexts(tool, input).flatMap(t => {
      if (ALLOW.test(t)) return []
      return findViolations(t, ext)
    })
    if (!hits.length) process.exit(0)

    const list = hits.slice(0, 8).map(h => `  ${h.kind}`).join('\n')
    process.stderr.write(
`BLOQUEADO: uso de "any"/"unknown" na tipagem (regra de tipagem do hicode — CLAUDE.md).

Arquivo: ${path}
${list}

Tipe de verdade: defina uma interface/tipo, um union concreto, generics (<T>), ou
tipos utilitarios. Para JSON externo, valide/parseie para um tipo conhecido.

Escape (ultimo caso, divida tecnica assumida): diretiva "hicode:allow-any" no topo do arquivo.
`)
    process.exit(2)
  } catch {
    process.exit(0)
  }
})
