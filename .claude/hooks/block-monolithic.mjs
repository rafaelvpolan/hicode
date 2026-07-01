#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const CODE_EXT = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'py']);
const MAX_LINES = 350;
const GOD_FUNCS = 20;
const GOD_EXPORTS = 3;
const ALLOW = /hicode:allow-monolith/;

function resultingContent(tool, input) {
  if (tool === 'Write') return input.content || '';
  let base = '';
  try { base = readFileSync(input.file_path, 'utf8'); } catch { base = ''; }
  const edits = tool === 'MultiEdit' ? (input.edits || []) : [{ old_string: input.old_string, new_string: input.new_string }];
  let out = base;
  for (const e of edits) {
    if (typeof e.old_string === 'string' && e.old_string.length && out.includes(e.old_string)) {
      out = out.replace(e.old_string, e.new_string || '');
    } else if (!base) {
      out += (e.new_string || '');
    }
  }
  return out;
}

function scriptOnly(text) {
  const blocks = text.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi);
  if (!blocks) return '';
  return blocks.map(b => b.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '')).join('\n');
}

function codeLines(text) {
  return text.split('\n').filter(l => l.trim() !== '').length;
}

function countFuncs(text) {
  const fn = (text.match(/\bfunction\b/g) || []).length;
  const arrow = (text.match(/\b(?:const|let|var)\s+[\w$]+\s*(?::[^=\n]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=\n]+)?=>/g) || []).length;
  return fn + arrow;
}

function countExports(text) {
  return (text.match(/\bexport\b/g) || []).length + (text.match(/\bmodule\.exports\b/g) || []).length;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(raw);
    const tool = ev.tool_name;
    const input = ev.tool_input || {};
    const path = input.file_path || '';
    const ext = (path.split('.').pop() || '').toLowerCase();
    if (!CODE_EXT.has(ext)) process.exit(0);

    const content = resultingContent(tool, input);
    if (ALLOW.test(content)) process.exit(0);

    const code = ext === 'vue' ? scriptOnly(content) : content;
    const lines = codeLines(code);
    const funcs = countFuncs(code);
    const exports = countExports(code);

    const tooLong = lines > MAX_LINES;
    const godFile = funcs >= GOD_FUNCS && exports < GOD_EXPORTS;
    if (!tooLong && !godFile) process.exit(0);

    const why = [];
    if (tooLong) why.push(`arquivo com ${lines} linhas de codigo (limite ${MAX_LINES})`);
    if (godFile) why.push(`god-file: ${funcs} funcoes e apenas ${exports} export(s) (limite: <${GOD_FUNCS} funcoes ou >=${GOD_EXPORTS} exports)`);

    process.stderr.write(
`BLOQUEADO: codigo monolitico (regra anti-monolito do hicode — CLAUDE.md).

Arquivo: ${path}
Motivo: ${why.join(' + ')}

Separe em modulos coesos: types em um arquivo, helpers puros em outro, e cada
grupo de funcoes/responsabilidade no seu proprio arquivo (< ${MAX_LINES} linhas).
Em .vue, extraia logica para composables e quebre em componentes menores.

Escape (ultimo caso, divida tecnica assumida): inclua a diretiva "hicode:allow-monolith"
no topo do arquivo.
`);
    process.exit(2);
  } catch {
    process.exit(0);
  }
});
