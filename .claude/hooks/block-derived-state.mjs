#!/usr/bin/env node
const DERIVED = /(^|\/)cards\/(runs|previews)\//;
const WRITERS = new Set(['Write', 'Edit', 'MultiEdit']);

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  try {
    const ev = JSON.parse(raw);
    const tool = ev.tool_name;
    if (!WRITERS.has(tool)) process.exit(0);

    const input = ev.tool_input || {};
    const path = (input.file_path || '').replace(/\\/g, '/');
    if (!DERIVED.test(path)) process.exit(0);

    process.stderr.write(
`BLOQUEADO: escrita em estado DERIVADO (regra do hicode — CLAUDE.md).

Arquivo: ${path}

cards/runs/*.json (estado/custo carimbado pelo harness lendo o disco) e cards/previews/**
(screenshots/URLs gerados pelo motor) sao DERIVADOS e nunca co-autorados pelo modelo.

A fonte de verdade e o card cards/<NNN-slug>.md e o motor/harness — nao a sua Write.
`);
    process.exit(2);
  } catch {
    process.exit(0);
  }
});
