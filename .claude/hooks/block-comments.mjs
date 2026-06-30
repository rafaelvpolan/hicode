#!/usr/bin/env node
const C_STYLE = new Set(['js','jsx','mjs','cjs','ts','tsx','mts','cts','java','go','c','h','cc','cpp','cxx','hpp','hh','cs','rs','swift','kt','kts','scala','dart','m','mm','proto','gradle','groovy','php','vala','zig']);
const HASH = new Set(['py','pyi','rb','r','pl','pm','ex','exs','nim','jl']);
const TEMPLATE = new Set(['js','jsx','mjs','cjs','ts','tsx','mts','cts']);
const PYDOC = new Set(['py','pyi']);

function styleFor(ext) {
  const cstyle = C_STYLE.has(ext);
  const hash = HASH.has(ext) || ext === 'php';
  if (!cstyle && !hash) return null;
  return { cstyle, hash, template: TEMPLATE.has(ext), pyDoc: PYDOC.has(ext), regex: TEMPLATE.has(ext) };
}

const REGEX_PREV = new Set("(,=:[!&|?;{+-*%^~<>".split(''));
const REGEX_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'case', 'void', 'delete', 'yield', 'await', 'throw', 'do', 'else', 'new']);

function scan(text, o) {
  const res = [];
  const n = text.length;
  let i = 0, line = 1, state = 'normal', quote = '', buf = '', cLine = 1, prevSig = '';
  const flush = () => { if (buf.trim()) res.push({ line: cLine, text: buf.trim() }); buf = ''; };
  const lineStartBlank = (pos) => {
    let j = pos - 1, seen = '';
    while (j >= 0 && text[j] !== '\n') { seen = text[j] + seen; j--; }
    const t = seen.trim();
    return t === '' || t.endsWith(':');
  };
  const regexHere = (pos) => {
    if (prevSig === '' || REGEX_PREV.has(prevSig)) return true;
    let j = pos - 1;
    while (j >= 0 && /\s/.test(text[j])) j--;
    let w = '';
    while (j >= 0 && /[A-Za-z]/.test(text[j])) { w = text[j] + w; j--; }
    return REGEX_KW.has(w);
  };
  while (i < n) {
    const c = text[i], c2 = text[i + 1], c3 = text.slice(i, i + 3);
    if (state === 'normal') {
      if (c === '\n') { line++; i++; continue; }
      if (o.pyDoc && (c3 === '"""' || c3 === "'''")) {
        const tq = c3, doc = lineStartBlank(i);
        if (doc) { cLine = line; buf = ''; }
        i += 3;
        while (i < n && text.slice(i, i + 3) !== tq) { if (text[i] === '\n') line++; if (doc) buf += text[i]; i++; }
        i += 3;
        if (doc) flush();
        prevSig = '"';
        continue;
      }
      if (c === '"' || c === "'") { state = 'str'; quote = c; i++; continue; }
      if (o.template && c === '`') { state = 'str'; quote = '`'; i++; continue; }
      if (o.cstyle && c === '/' && c2 === '/') { state = 'line'; cLine = line; buf = ''; i += 2; continue; }
      if (o.cstyle && c === '/' && c2 === '*') { state = 'block'; cLine = line; buf = ''; i += 2; continue; }
      if (o.regex && c === '/' && regexHere(i)) {
        i++;
        let inClass = false;
        while (i < n) {
          const rc = text[i];
          if (rc === '\\') { i += 2; continue; }
          if (rc === '\n') break;
          if (rc === '[') { inClass = true; i++; continue; }
          if (rc === ']') { inClass = false; i++; continue; }
          if (rc === '/' && !inClass) { i++; break; }
          i++;
        }
        prevSig = '/';
        continue;
      }
      if (o.hash && c === '#' && i === 0 && c2 === '!') { while (i < n && text[i] !== '\n') i++; continue; }
      if (o.hash && c === '#') { state = 'line'; cLine = line; buf = ''; i++; continue; }
      if (c !== ' ' && c !== '\t' && c !== '\r') prevSig = c;
      i++; continue;
    }
    if (state === 'str') {
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') line++;
      if (c === quote) { state = 'normal'; prevSig = quote; }
      i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'normal'; flush(); line++; i++; continue; }
      buf += c; i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'normal'; flush(); i += 2; continue; }
      if (c === '\n') line++;
      buf += c; i++; continue;
    }
  }
  if (state === 'line' || state === 'block') flush();
  return res;
}

const DIRECTIVE = /eslint-disable|eslint-enable|eslint-env|@ts-expect-error|@ts-ignore|@ts-nocheck|@ts-check|prettier-ignore|biome-ignore|type:\s*ignore|noqa|pylint:|pyright:|mypy:|pragma|istanbul ignore|c8 ignore|v8 ignore|jshint|globals?\s|webpackchunkname|@preserve|__pure__|sourcemappingurl|sourceurl|@flow|@jsx|vitest-environment|jest-environment|@vite-ignore|deno-lint-ignore|nolint|nosec|@ts-/i;
const LICENSE = /copyright|spdx-license|@license|all rights reserved|licen[sc]ed under|mit license|apache license|bsd license|gnu (general|lesser)/i;
const SMELL = /code[\s_-]?smell/i;
const TASK = /^\s*(todo|fixme|hack|xxx|wip|optimize|optimise|deprecated|refactor|review|temp)\b/i;
const TICKET = /^\s*[A-Z][A-Z0-9]+-\d+\b/;

function allowed(t, line) {
  if (DIRECTIVE.test(t)) return true;
  if (TASK.test(t)) return true;
  if (TICKET.test(t)) return true;
  if (line <= 15 && LICENSE.test(t)) return true;
  if (SMELL.test(t)) return true;
  return false;
}

function newTexts(tool, input) {
  if (tool === 'Write') return [input.content || ''];
  if (tool === 'Edit') return [input.new_string || ''];
  if (tool === 'MultiEdit') return (input.edits || []).map(e => e.new_string || '');
  return [];
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
    const o = styleFor(ext);
    if (!o) process.exit(0);
    const hits = newTexts(tool, input).flatMap(t => scan(t, o)).filter(h => !allowed(h.text, h.line));
    if (!hits.length) process.exit(0);
    const list = hits.slice(0, 8).map(h => `  L${h.line}: ${h.text.replace(/\s+/g, ' ').slice(0, 90)}`).join('\n');
    process.stderr.write(
`BLOQUEADO: comentario/docstring em codigo (regra Clean Code do hicode — CLAUDE.md).

Arquivo: ${path}
${list}

Remova. Se voce acha que precisa explicar algo aqui, ISSO E CODE SMELL:
extraia para uma funcao/variavel com nome revelador em vez de comentar.

Permitido: cabecalho de licenca, diretivas de tooling (eslint-disable, @ts-expect-error,
type: ignore, pragma...), e — APENAS em ultimo caso absoluto — um comentario que contenha
explicitamente a palavra "code-smell" reconhecendo a divida tecnica.
`);
    process.exit(2);
  } catch {
    process.exit(0);
  }
});
