<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { CardView, RunView } from '#shared/types'
import { estaBloqueado } from '#shared/status'
import { useCardResumo } from '../composables/useCardResumo'

interface CardRowProps {
  card: CardView
  runs: RunView[]
  estimates: Record<string, number>
}

interface CardRowEmits {
  start: [id: string]
  pause: [id: string]
  resume: [id: string]
  resolve: [id: string]
  approve: [id: string]
  reject: [id: string]
  edit: [card: CardView]
  remove: [card: CardView]
  replay: [step: string]
  review: [id: string]
  preview: [id: string]
  reset: [id: string]
  clarify: [id: string, answers: { q: string; answer: string }[]]
}

const props = defineProps<CardRowProps>()
defineEmits<CardRowEmits>()

const cardRef = toRef(props, 'card')
const runsRef = computed(() => props.runs)
const { tom, trabalhando } = useCardResumo(cardRef, runsRef)

const bloqueado = computed<boolean>(() => estaBloqueado(props.card.status))
</script>

<template>
  <BasePainel class="linha" elevado :tom="tom" :destacado="trabalhando">
    <CardCabecalho :card="card" @editar="$emit('edit', card)" @remover="$emit('remove', card)" />

    <p v-if="card.desc && card.desc !== card.title" class="desc">{{ card.desc }}</p>

    <CardBloqueio v-if="bloqueado" :card="card" @resolver="$emit('resolve', card.id)" />

    <CardClarify
      v-else-if="card.status === 'CLARIFY'"
      :card="card"
      @answered="(answers) => $emit('clarify', card.id, answers)"
    />

    <CardTrilha
      v-if="card.status !== 'CLARIFY'"
      :card="card"
      :runs="runs"
      :estimates="estimates"
      @replay="(step) => $emit('replay', step)"
    />

    <CardAcoes
      :card="card"
      @comecar="$emit('start', card.id)"
      @pausar="$emit('pause', card.id)"
      @retomar="$emit('resume', card.id)"
      @aprovar="$emit('approve', card.id)"
      @rejeitar="$emit('reject', card.id)"
      @resetar="$emit('reset', card.id)"
      @preview="$emit('preview', card.id)"
      @review="$emit('review', card.id)"
    />

    <CardAtividade :card-id="card.id" :status="card.status" :atualizado="card.updated" />

    <CardExecucoes :card="card" :runs="runs" />
  </BasePainel>
</template>

<style scoped>
.linha { display: flex; flex-direction: column; gap: var(--esp-4); }

.desc {
  margin: 0;
  white-space: pre-wrap;
  font-size: var(--tf-peq);
  color: var(--texto-mudo);
  border-left: 2px solid var(--hairline);
  padding-left: var(--esp-3);
}
</style>
