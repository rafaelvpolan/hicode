export const ALLOW = /hicode:allow-any/
export const TS_EXT = new Set(['ts', 'tsx', 'mts', 'cts', 'vue'])

const PATTERNS = [
  { re: /:\s*any\b/, kind: ': any' },
  { re: /:\s*unknown\b/, kind: ': unknown' },
  { re: /\bas\s+any\b/, kind: 'as any' },
  { re: /\bas\s+unknown\b/, kind: 'as unknown' },
  { re: /<\s*any\b/, kind: '<any' },
  { re: /<\s*unknown\b/, kind: '<unknown' },
  { re: /\bany\s*\[\]/, kind: 'any[]' },
  { re: /\bunknown\s*\[\]/, kind: 'unknown[]' },
  { re: /[,|&]\s*any\b/, kind: 'any (uniao/generico)' },
  { re: /[,|&]\s*unknown\b/, kind: 'unknown (uniao/generico)' },
]

function blankNonNewline(m) {
  return m.replace(/[^\n]/g, ' ')
}

export function stripNonCode(text) {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, blankNonNewline)
  t = t.replace(/\/\/[^\n]*/g, blankNonNewline)
  t = t.replace(/`(?:\\.|[^`\\])*`/g, blankNonNewline)
  t = t.replace(/'(?:\\.|[^'\\])*'/g, blankNonNewline)
  t = t.replace(/"(?:\\.|[^"\\])*"/g, blankNonNewline)
  return t
}

export function scriptOnly(text) {
  const blocks = text.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi)
  if (!blocks) return ''
  return blocks.map(b => b.replace(/^<script\b[^>]*>/i, m => blankNonNewline(m)).replace(/<\/script>$/i, '')).join('\n')
}

export function findViolations(text, ext) {
  const base = ext === 'vue' ? scriptOnly(text) : text
  const code = stripNonCode(base)
  const out = []
  const lines = code.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const p of PATTERNS) {
      if (p.re.test(line)) { out.push({ line: i + 1, kind: p.kind }); break }
    }
  }
  return out
}
