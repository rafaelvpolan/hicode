export type Surface = 'visual' | 'none'

export interface SurfaceVerdict {
  surface: Surface
  reason: string
}

const NON_VISUAL = [
  'conflit\\w*', 'merge', 'rebase\\w*',
  'refator\\w*', 'refatora\\w*', 'refactor\\w*',
  'dependenc\\w*', 'bump', 'lockfile', 'pacote', 'package',
  'config\\w*', 'variavel', 'env',
  'pipeline', 'workflow', 'deploy\\w*', 'ci', 'cd',
  'lint', 'typecheck', 'tsconfig', 'eslint', 'tipagem',
  'test\\w*', 'cobertura', 'coverage', 'mock\\w*',
  'backend', 'endpoint\\w*', 'api', 'servidor\\w*',
  'migration\\w*', 'migracao', 'migracoes', 'schema\\w*', 'query\\w*', 'indice\\w*', 'sql',
  'readme', 'changelog', 'docstring\\w*', 'comentario\\w*', 'documentacao',
  'renomear', 'script\\w*', 'cron', 'hook\\w*',
]

const VISUAL = [
  'pagina\\w*', 'page', 'tela\\w*', 'landing',
  'componente\\w*', 'component\\w*',
  'botao', 'botoes', 'button\\w*',
  'layout', 'css', 'estilo\\w*', 'style\\w*', 'tema', 'theme',
  'cor', 'cores', 'colorid\\w*', 'fonte\\w*', 'icone\\w*', 'icon\\w*', 'imagem', 'imagens', 'logo',
  'hero', 'banner\\w*', 'rodape', 'footer', 'header', 'cabecalho', 'menu\\w*', 'navbar', 'sidebar',
  'modal\\w*', 'popup\\w*', 'dropdown\\w*', 'tooltip\\w*', 'badge\\w*', 'selo\\w*',
  'responsiv\\w*', 'mobile', 'breakpoint\\w*',
  'ux', 'design', 'visual\\w*', 'aparencia', 'animac\\w*', 'transic\\w*', 'hover',
  'titulo\\w*', 'subtitulo\\w*',
]

function buildRe(stems: string[]): RegExp {
  return new RegExp('\\b(?:' + stems.join('|') + ')\\b')
}

const NON_VISUAL_RE = buildRe(NON_VISUAL)
const VISUAL_RE = buildRe(VISUAL)

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function classifySurface(title: string, objetivo: string, hasSurface: boolean): SurfaceVerdict {
  if (!hasSurface) return { surface: 'none', reason: 'repo sem dev server (nada a renderizar)' }
  const text = ` ${norm(title)} ${norm(objetivo)} `
  const vis = text.match(VISUAL_RE)
  if (vis) return { surface: 'visual', reason: `sinal visual: "${vis[0]}"` }
  const nv = text.match(NON_VISUAL_RE)
  if (nv) return { surface: 'none', reason: `sinal nao-visual: "${nv[0]}"` }
  return { surface: 'visual', reason: 'ambiguo — assume visual (mostra o preview)' }
}
