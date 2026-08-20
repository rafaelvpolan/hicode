<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { CardView, RunView } from '#shared/types'
import { useCardResumo } from '../../composables/useCardResumo'
import { useFaseDaFalha } from '../../composables/useFaseDaFalha'
import { useStepTiming, type StepTimingItem } from '../../composables/useStepTiming'

const LACUNA_HALT = 'o motor não gravou em que passo este card parou — sem entrada halt em cards/runs/<id>.failures.jsonl, a trilha não adivinha a fase'
const LACUNA_SEM_TEMPOS = 'posição na trilha indisponível — o motor não registra a etapa corrente e não há execução com tempos gravados'

interface CardTrilhaProps {
  card: CardView
  runs: RunView[]
  estimates: Record<string, number>
}

interface CardTrilhaEmits {
  replay: [step: string]
}

const props = defineProps<CardTrilhaProps>()
defineEmits<CardTrilhaEmits>()

const cardRef = toRef(props, 'card')
const runsRef = computed(() => props.runs)
const estimatesRef = computed(() => props.estimates)
const { execucoes, ultimaExecucao } = useCardResumo(cardRef, runsRef)
const { faseDaFalha, parado } = useFaseDaFalha(cardRef)
const etapas = useStepTiming(cardRef, ultimaExecucao, execucoes, estimatesRef, faseDaFalha)

const indiceAtual = computed<number>(() => etapas.value.findIndex((e) => e.estado === 'agora' || e.estado === 'falhou'))
const posicaoDesconhecida = computed<boolean>(() => indiceAtual.value < 0 && !etapas.value.some((e) => e.estado === 'feito'))

const motivoDaLacuna = computed<string>(() => (parado.value ? LACUNA_HALT : LACUNA_SEM_TEMPOS))

const progresso = computed<number>(() => {
  const concluidas = etapas.value.filter((e) => e.estado === 'feito').length
  const alvo = indiceAtual.value >= 0 ? indiceAtual.value : concluidas
  return etapas.value.length > 1 ? alvo / (etapas.value.length - 1) : 0
})

const tomDoProgresso = computed<'acento' | 'falha'>(() => (parado.value ? 'falha' : 'acento'))

function detalheDaEtapa(etapa: StepTimingItem): string {
  return [etapa.elapsedLabel, etapa.estimateLabel].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="trilha-card">
    <BaseProgresso :valor="progresso" :tom="tomDoProgresso" />
    <BaseTrilha>
      <BaseEtapa
        v-for="(e, i) in etapas"
        :key="e.status"
        :numero="i + 1"
        :rotulo="e.label"
        :estado="e.estado"
        :detalhe="detalheDaEtapa(e)"
        :ultima="i === etapas.length - 1"
        :acao-rotulo="e.resumeStep ? 'rodar a partir daqui' : ''"
        @acao="e.resumeStep && $emit('replay', e.resumeStep)"
      />
    </BaseTrilha>
    <p v-if="posicaoDesconhecida" class="lacuna">{{ motivoDaLacuna }}</p>
  </div>
</template>

<style scoped>
.trilha-card { display: flex; flex-direction: column; gap: var(--esp-4); }

.lacuna {
  margin: 0;
  font-size: var(--tf-micro);
  color: var(--texto-fraco);
  font-family: var(--fonte-mono);
}
</style>
