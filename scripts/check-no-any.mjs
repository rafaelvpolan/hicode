#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { ALLOW, TS_EXT, findViolations } from './no-any-detect.mjs'

const ROOTS = ['runner.ts', 'bin', 'lib', 'panel/app', 'panel/server', 'panel/shared']
const SKIP_DIR = new Set(['node_modules', '.nuxt', '.output', 'dist', '.git'])

function walk(entry, acc) {
  let st
  try { st = statSync(entry) } catch { return }
  if (st.isDirectory()) {
    if (SKIP_DIR.has(entry.split('/').pop() || '')) return
    for (const name of readdirSync(entry)) walk(join(entry, name), acc)
    return
  }
  const ext = extname(entry).slice(1).toLowerCase()
  if (TS_EXT.has(ext)) acc.push(entry)
}

const files = []
for (const r of ROOTS) walk(r, files)

let total = 0
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  if (ALLOW.test(text)) continue
  const ext = extname(f).slice(1).toLowerCase()
  const hits = findViolations(text, ext)
  for (const h of hits) {
    process.stdout.write(`${f}:${h.line}  ${h.kind}\n`)
    total++
  }
}

if (total) {
  process.stderr.write(`\nlint no-any: ${total} uso(s) de any/unknown proibido(s). Tipe de verdade ou use hicode:allow-any.\n`)
  process.exit(1)
}
process.stdout.write('lint no-any: ok (nenhum any/unknown)\n')
process.exit(0)
