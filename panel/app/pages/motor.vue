<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { enviarIntencao, lerIntencao } from '#shared/intencao'
import type { ResultadoDoPedido } from '#shared/intencao'
import type { Atividade, Snapshot } from '#shared/observabilidade'
// Esta pagina nao inicia o observador legado de filesystem do layout padrao.
definePageMeta({ layout: false })

const senha = ref('')
const autenticado = ref(false)
const erro = ref('')
const aviso = ref('')
const repo = ref('')
const conectado = ref(false)
const degradado = ref(false)
const atividades = ref<Atividade[]>([])
const selecionada = ref('')
const revisaoDaTarefa = ref('')
const estadoDaTarefa = ref('')
const perguntaDaTarefa = ref('')
const perguntaId = ref('')
const etagPergunta = ref('')
const sessao = ref('')
const texto = ref('')
const modo = ref<'gateway' | 'orquestrador' | 'ask'>('gateway')
const ocupado = ref(false)
const consulta = ref('')
const resposta = ref('')
let fonte: EventSource | null = null
let timer: ReturnType<typeof setInterval> | undefined
const detalhe = computed(() => atividades.value.find(a => a.id === selecionada.value))
async function selecionar(a: Atividade): Promise<void> {
  selecionada.value = a.id; revisaoDaTarefa.value = ''; estadoDaTarefa.value = ''; perguntaDaTarefa.value = ''; perguntaId.value = ''; etagPergunta.value = ''
  if (!a.execucao) return
  try {
    const t = await $fetch<{ etag: string; valor: { campos: Record<string, string> }; pergunta: { etag: string; valor: { perguntaId: string | null; pendencia: { atual: { q: string; options: string[] } } | null } } }>('/api/hii/tarefa', { query: { id: a.execucao } })
    if (selecionada.value !== a.id) return
    revisaoDaTarefa.value = t.etag
    estadoDaTarefa.value = t.valor.campos.status || ''
    perguntaDaTarefa.value = t.valor.campos.review_questions || t.valor.campos.clarify_question || t.valor.campos.halt_reason || ''
    perguntaId.value = t.pergunta.valor.perguntaId || ''
    etagPergunta.value = t.pergunta.etag
    if (t.pergunta.valor.pendencia) perguntaDaTarefa.value = [t.pergunta.valor.pendencia.atual.q, ...t.pergunta.valor.pendencia.atual.options.map((o, i) => `${i + 1}. ${o}`)].join('\n')
  } catch { /* atividade historica/retida pode nao ter tarefa disponivel */ }
}
const ordenadas = computed(() => {
  const filhos = (pai: string | null, vistos = new Set<string>(), nivel = 0): { a: Atividade; nivel: number }[] => atividades.value.filter(a => a.pai === pai && !vistos.has(a.id)).sort((a, b) => a.inicio.localeCompare(b.inicio)).flatMap(a => {
    vistos.add(a.id)
    return [{ a, nivel }, ...filhos(a.id, vistos, Math.min(nivel + 1, 5))]
  })
  const ids = new Set(atividades.value.map(a => a.id))
  const raizes = atividades.value.filter(a => !a.pai || !ids.has(a.pai))
  return raizes.sort((a, b) => b.inicio.localeCompare(a.inicio)).flatMap(a => [{ a, nivel: 0 }, ...filhos(a.id)])
})
function atualizar(s: Snapshot & { repo?: string }): void {
  atividades.value = s.atividades
  degradado.value = s.degradado
  repo.value = s.repo || repo.value
}
function conectar(): void {
  fonte?.close()
  fonte = new EventSource('/api/hii/eventos')
  fonte.addEventListener('snapshot', event => {
    atualizar(JSON.parse((event as MessageEvent<string>).data) as Snapshot)
    conectado.value = true
  })
  fonte.addEventListener('degradado', () => { degradado.value = true })
  fonte.onerror = () => { conectado.value = false }
}
async function carregar(): Promise<void> {
  try {
    const s = await $fetch<Snapshot & { repo: string }>('/api/hii/snapshot')
    atualizar(s); autenticado.value = true; conectar(); erro.value = ''
    const pendente = lerIntencao(sessionStorage, repo.value)
    if (pendente) {
      texto.value = pendente.pedido.texto
      modo.value = pendente.pedido.modo
      sessao.value = pendente.pedido.sessao
      aviso.value = 'Pedido anterior sem confirmacao. Revise e reenvie para retomar a mesma intencao.'
    }
  } catch { erro.value = 'Entre para conectar. Se ja entrou, verifique a configuracao do backend e do motor.' }
}
async function entrar(): Promise<void> {
  try { await $fetch('/api/hii/login', { method: 'POST', body: { senha: senha.value } }); senha.value = ''; await carregar() }
  catch { erro.value = 'Nao foi possivel entrar. Confira a credencial e a configuracao do painel.' }
}
async function enviar(): Promise<void> {
  if (ocupado.value) return
  ocupado.value = true; erro.value = ''; aviso.value = ''
  try {
    const r = await enviarIntencao(sessionStorage, repo.value,
      { texto: texto.value, modo: modo.value, sessao: sessao.value },
      comando => $fetch<ResultadoDoPedido>('/api/hii/comando', { method: 'POST', body: comando }))
    if (modo.value === 'ask') {
      consulta.value = r.id
      resposta.value = 'Consulta em andamento…'
    } else {
      sessao.value = r.sessao
      aviso.value = `Execucao #${r.id}: ${r.status}`
    }
    texto.value = ''
  } catch { erro.value = 'Pedido sem confirmacao. Reenvie o mesmo pedido para consultar a intencao original com a mesma chave; nao altere o texto.' }
  finally { ocupado.value = false }
}
async function agir(acao: string): Promise<void> {
  if (ocupado.value) return
  const id = detalhe.value?.execucao
  if (!id) return
  ocupado.value = true
  try {
    await $fetch('/api/hii/comando', { method: 'POST', body: { acao, id, texto: texto.value, etag: revisaoDaTarefa.value, perguntaId: perguntaId.value, etagPergunta: etagPergunta.value, chave: crypto.randomUUID() } })
    revisaoDaTarefa.value = ''
    aviso.value = `Acao ${acao} recebida pelo motor.`
  } catch { erro.value = 'Acao recusada ou resultado incerto. Consulte o estado atualizado antes de agir novamente.' }
  finally { ocupado.value = false }
}
onMounted(() => {
  void carregar()
  timer = setInterval(async () => {
    if (!consulta.value) return
    try {
      const c = await $fetch<{ estado: string; resposta: string }>('/api/hii/consulta', { query: { id: consulta.value } })
      resposta.value = c.resposta || c.estado
      if (c.estado !== 'running') consulta.value = ''
    } catch { resposta.value = 'Consulta indisponivel; nenhum pedido foi repetido.' }
  }, 1500)
})
onBeforeUnmount(() => { fonte?.close(); if (timer) clearInterval(timer) })
</script>

<template>
  <section class="motor">
    <nav><NuxtLink to="/">hicode</NuxtLink> / motor ao vivo</nav>
    <header class="titulo"><div><p class="eyebrow">HII · EXECUCAO EXTERNA</p><h1>Motor ao vivo</h1><p>{{ repo || 'Conexao autenticada com o motor' }}</p></div><span class="conexao">{{ degradado ? 'Observacao degradada' : conectado ? 'Conectado' : 'Aguardando conexao' }}</span></header>
    <p v-if="erro" role="alert" class="alerta">{{ erro }}</p>
    <p v-if="aviso" role="status">{{ aviso }}</p>
    <form v-if="!autenticado" class="entrada" @submit.prevent="entrar"><label>Credencial do painel <input v-model="senha" type="password" autocomplete="current-password" required></label><button>Entrar</button><p>O token do motor permanece no backend.</p></form>
    <template v-else>
      <p><NuxtLink to="/planejamento">Descoberta e planejamento de produto →</NuxtLink></p>
      <MotorConfiguracao />
      <p class="alerta">Conclusao do gateway indica o fim da chamada. Gates, evidencias e PR dependem da execucao orquestrada e de suas verificacoes.</p>
      <form class="pedido" @submit.prevent="enviar">
        <label>Modo <select v-model="modo"><option value="gateway">Gateway</option><option value="orquestrador">Orquestrador /hii</option><option value="ask">Pergunta · somente leitura</option></select></label>
        <label>Sessao <input v-model="sessao" placeholder="Nova automaticamente" inputmode="numeric"></label>
        <label class="texto">Pedido ou resposta humana <textarea v-model="texto" rows="3" required placeholder="Descreva o trabalho ou a pergunta"></textarea></label>
        <button :disabled="ocupado || !texto.trim()">{{ ocupado ? 'Enviando…' : modo === 'ask' ? 'Perguntar' : 'Executar pedido' }}</button>
      </form>
      <pre v-if="resposta" class="resposta">{{ resposta }}</pre>
      <div class="colunas">
        <section class="arvore"><h2>Atividades</h2><p v-if="!ordenadas.length">Nenhuma atividade observada neste projeto.</p><button v-for="{ a, nivel } in ordenadas" :key="a.id" class="atividade" :class="{ selecionada: selecionada === a.id }" :style="{ paddingLeft: `${16 + nivel * 16}px` }" @click="selecionar(a)"><span class="estado" :data-estado="a.estado">{{ a.estado }}</span><strong>{{ a.recurso.nome }}</strong><small>{{ a.execucao ? `#${a.execucao}` : 'consulta' }} · {{ a.etapa }} · {{ a.recurso.tipo === 'skill' ? 'instrucoes carregadas' : a.recurso.tipo }}</small></button></section>
        <section class="detalhe"><h2>Detalhes</h2><p v-if="!detalhe">Selecione uma atividade para acompanhar o executor e sua saida.</p><template v-else><h3>{{ detalhe.recurso.nome }}</h3><dl><dt>Estado / tentativa</dt><dd>{{ detalhe.estado }} · {{ detalhe.tentativa }}</dd><dt>Ultimo progresso / heartbeat</dt><dd>{{ detalhe.atualizado }} / {{ detalhe.heartbeat || 'nao reportado' }}</dd><dt>Observabilidade</dt><dd>{{ detalhe.recurso.observabilidade }}</dd><dt>Custo / tokens</dt><dd>{{ detalhe.metricas.custoUsd.valor === null ? 'custo desconhecido' : `$${detalhe.metricas.custoUsd.valor}` }} / {{ detalhe.metricas.tokens.valor ?? 'desconhecidos' }}</dd></dl><details open><summary>Contexto e motivos</summary><dl><template v-for="(valor, chave) in detalhe.detalhes" :key="chave"><dt>{{ chave }}</dt><dd>{{ valor ?? 'nao reportado' }}</dd></template></dl></details><p v-if="estadoDaTarefa">Estado consultado: {{ estadoDaTarefa }}. Se mudar, o motor recusara a acao pela revisao.</p><pre v-if="perguntaDaTarefa" class="saida">{{ perguntaDaTarefa }}</pre><div v-if="detalhe.execucao &amp;&amp; revisaoDaTarefa" class="acoes"><button :disabled="ocupado" @click="agir('parar')">Parar</button><button :disabled="ocupado" @click="agir('retomar')">Retomar</button><button :disabled="ocupado || !texto.trim()" @click="agir('responder')">Responder</button><button :disabled="ocupado" @click="agir('confirmar-fecho')">Confirmar fecho</button></div><p v-if="detalhe.truncado">Inicio da saida fora da retencao.</p><pre v-for="s in detalhe.saida" :key="s.sequencia" class="saida"><small>{{ s.sequencia }} · {{ s.canal }}</small>
{{ s.texto }}</pre></template></section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.motor{max-width:1280px;margin:0 auto;padding-inline:24px!important}
.motor{padding:24px 0}.titulo{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:28px}.titulo h1{font-size:30px;margin:4px 0}.eyebrow,.conexao{font:12px monospace;letter-spacing:.06em}.conexao{border:1px solid #68756e;padding:8px 12px;border-radius:20px}.entrada,.pedido{padding:20px;border:1px solid #3a423d;border-radius:8px;margin-bottom:24px}.pedido{display:flex;flex-wrap:wrap;gap:16px;align-items:end}label{display:flex;flex-direction:column;gap:8px;font-size:13px}.texto{flex-basis:100%}input,select,textarea{font:inherit;padding:10px;background:transparent;color:inherit;border:1px solid #65716a;border-radius:5px}option{color:#111}button{font:inherit;padding:10px 16px;cursor:pointer;border:1px solid #65716a;border-radius:5px;background:transparent;color:inherit}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #76d8ad;outline-offset:3px}.colunas{display:grid;grid-template-columns:minmax(260px,1fr) minmax(300px,1.2fr);gap:28px}.arvore,.detalhe{min-width:0}.atividade{display:flex;flex-wrap:wrap;align-items:center;gap:9px;width:100%;text-align:left;border-radius:0;border-width:0 0 1px;padding-block:14px}.atividade small{width:100%;opacity:.65}.selecionada{background:#24453755}.estado{font:11px monospace;padding:3px 6px;border:1px solid #647368;border-radius:3px}.estado[data-estado=failed]{color:#ee9c9c}.estado[data-estado=running]{color:#76d8ad}dl{font-size:13px}dt{opacity:.6;margin-top:14px}dd{margin:4px 0;overflow-wrap:anywhere}.saida,.resposta{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 monospace;padding:15px;border:1px solid #3a423d;border-radius:5px;max-height:360px;overflow:auto}.saida small{opacity:.55}.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.alerta{border-left:3px solid #d9a86c;padding:12px}h2{font-size:18px}h3{font-size:16px}@media(max-width:800px){.colunas{grid-template-columns:1fr}.titulo{align-items:start;flex-direction:column}.pedido label{width:100%}}
</style>
