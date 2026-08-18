import { truncVisible, padVisible } from '../tui/layout'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const INVERSO = '\x1b[7m'

export const AJUDA_DO_COMANDO: Record<string, string> = {
  '/help': 'todos os comandos e teclas',
  '/board': 'quadro do projeto',
  '/config': 'ias conectadas, uso de 5h e da semana, tokens e loop',
  '/cards': 'lista crua, por estado',
  '/plan': 'mostra o plano da tarefa',
  '/watch': 'entra na tarefa e segue a execucao',
  '/agents': 'agentes e ferramentas usados',
  '/ask': 'responde a pergunta que travou a tarefa',
  '/ok': 'aprova o preview que voce viu',
  '/no': 'rejeita o preview e manda corrigir',
  '/preview': 'sobe o dev server, ou lista os que rodam',
  '/stop': 'para a tarefa em execucao',
  '/halt': 'para a tarefa (mesmo que /stop)',
  '/rm': 'apaga tarefas e limpa o que fica atras',
  '/new-task': 'cria a tarefa direto, sem leitura de intencao',
  '/new-ask': 'pergunta sobre o projeto, sem criar card',
  '/new-session': 'limpa a area e recomeca a sessao',
  '/ia': 'escolhe a ia que roda cada papel',
  '/model': 'escolhe o modelo da ia atual',
  '/effort': 'escolhe o esforco da ia atual',
  '/repo': 'troca de projeto',
  '/project': 'troca de projeto (mesmo que /repo)',
  '/exit': 'sai do hii e volta para o shell',
  '/quit': 'sai — as tarefas seguem rodando',
}

export interface SugestoesOptions {
  color: boolean
  width: number
  selecionado: number
}

const PADRAO: SugestoesOptions = { color: false, width: 78, selecionado: -1 }

function paint(s: string, cor: string, o: SugestoesOptions): string {
  return o.color ? `${cor}${s}${RESET}` : s
}

export function renderSugestoes(opcoes: string[], opts: Partial<SugestoesOptions> = {}): string[] {
  const o = { ...PADRAO, ...opts }
  if (!opcoes.length) return []
  const mostrar = opcoes.slice(0, 6)
  const largura = mostrar.reduce((a, s) => Math.max(a, s.length), 0)
  const linhas = mostrar.map((opcao, i) => {
    const ajuda = AJUDA_DO_COMANDO[opcao] ?? ''
    const rotulo = padVisible(opcao, largura)
    const alvo = i === o.selecionado
    const corpo = alvo
      ? paint(` ${rotulo} `, INVERSO, o)
      : ` ${paint(rotulo, CYAN, o)} `
    const cauda = ajuda ? paint(`  ${ajuda}`, DIM, o) : ''
    return truncVisible(`  ${corpo}${cauda}`, o.width)
  })
  const resto = opcoes.length - mostrar.length
  if (resto > 0) linhas.push(paint(`  e mais ${resto}`, DIM, o))
  return linhas
}

export function prefixoComum(opcoes: string[]): string {
  if (!opcoes.length) return ''
  const primeiro = opcoes[0] ?? ''
  let fim = primeiro.length
  for (const o of opcoes) {
    let i = 0
    while (i < fim && i < o.length && o[i] === primeiro[i]) i++
    fim = i
  }
  return primeiro.slice(0, fim)
}
