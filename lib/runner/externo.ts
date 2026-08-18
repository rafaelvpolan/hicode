const FERRAMENTAS = [
  'notion', 'slack', 'linear', 'jira', 'asana', 'trello', 'monday', 'confluence',
  'figma', 'airtable', 'clickup', 'intercom', 'hubspot', 'zendesk', 'sheets',
  'planilha\\w*', 'drive', 'calendar', 'agenda', 'gmail', 'discord', 'telegram', 'whatsapp',
]
const PONTE = ['mcp', 'conector\\w*', 'connector\\w*']
const ACAO = [
  'cri\\w*', 'crie', 'adicion\\w*', 'registr\\w*', 'abr\\w*', 'abra', 'atualiz\\w*',
  'mov\\w*', 'coment\\w*', 'anot\\w*', 'envi\\w*', 'post\\w*', 'marc\\w*', 'agend\\w*',
  'duplic\\w*', 'arquiv\\w*',
]
const ARTEFATO = [
  'tarefa\\w*', 'task\\w*', 'subtask\\w*', 'card\\w*', 'pagina\\w*', 'page\\w*',
  'issue\\w*', 'ticket\\w*', 'doc\\w*', 'documento\\w*', 'nota\\w*', 'evento\\w*',
  'mensagem\\w*', 'registro\\w*', 'item', 'itens',
]
const CODIGO = [
  'implement\\w*', 'integr\\w*', 'refator\\w*', 'refatora\\w*', 'refactor\\w*',
  'corrig\\w*', 'corrij\\w*', 'endpoint\\w*', 'componente\\w*', 'component\\w*',
  'migration\\w*', 'migracao', 'schema\\w*', 'deploy\\w*', 'api', 'sdk', 'webhook\\w*',
  'biblioteca\\w*', 'pacote\\w*', 'codig\\w*', 'code',
]

function re(stems: string[]): RegExp {
  return new RegExp('\\b(?:' + stems.join('|') + ')\\b')
}

const FERRAMENTAS_RE = re(FERRAMENTAS)
const PONTE_RE = re(PONTE)
const ACAO_RE = re(ACAO)
const ARTEFATO_RE = re(ARTEFATO)
const CODIGO_RE = re(CODIGO)

const LIMITE_INSTRUCAO = 250

export function instrucaoDe(texto: string): string {
  const primeira = (texto ?? '').split('\n')[0] ?? ''
  return primeira.slice(0, LIMITE_INSTRUCAO)
}

export interface AcaoExterna {
  externo: boolean
  ferramenta: string
  motivo: string
}

export function lerAcaoExterna(titulo: string, objetivo: string): AcaoExterna {
  const bruto = `${titulo ?? ''}\n${objetivo ?? ''}`
  const t = ` ${instrucaoDe(bruto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `
  const ferramenta = t.match(FERRAMENTAS_RE)?.[0] ?? ''
  const ponte = PONTE_RE.test(t)
  if (!ferramenta && !ponte) return { externo: false, ferramenta: '', motivo: '' }
  if (CODIGO_RE.test(t)) return { externo: false, ferramenta, motivo: '' }
  if (!ACAO_RE.test(t) || !ARTEFATO_RE.test(t)) return { externo: false, ferramenta, motivo: '' }
  const onde = ferramenta || 'ferramenta externa'
  return {
    externo: true,
    ferramenta: onde,
    motivo: `acao externa em ${onde} — nao muda codigo do repo`,
  }
}
