<script setup lang="ts">
import { computed } from 'vue'
import type { CardView } from '#shared/types'
import { aguardaAprovacaoDeUrl, podeComecar, temUrlViva } from '#shared/status'
import { ehPrevisualizavel, ehRevisavel } from '../../composables/useCardResumo'

interface CardAcoesProps {
  card: CardView
}

interface CardAcoesEmits {
  comecar: []
  pausar: []
  retomar: []
  aprovar: []
  rejeitar: []
  resetar: []
  preview: []
  review: []
}

const props = defineProps<CardAcoesProps>()
defineEmits<CardAcoesEmits>()

const temUrl = computed<boolean>(() => temUrlViva(props.card.status) && !!props.card.preview_url)
const iniciavel = computed<boolean>(() => podeComecar(props.card.status))
const aguardandoAprovacao = computed<boolean>(() => aguardaAprovacaoDeUrl(props.card.status))
const previsualizavel = computed<boolean>(() => ehPrevisualizavel(props.card))
const revisavel = computed<boolean>(() => ehRevisavel(props.card))
</script>

<template>
  <div class="acoes">
    <a v-if="temUrl" class="vivo" :href="card.preview_url" target="_blank" rel="noopener">▶ abrir url ao vivo ↗</a>

    <BaseBotao v-if="iniciavel" variante="solido" @click="$emit('comecar')">▶ começar</BaseBotao>

    <template v-else-if="card.status === 'EXECUTING'">
      <BaseChip rotulo="executando" tom="rodando" ponto pulsando />
      <BaseBotao @click="$emit('pausar')">⏸ pausar</BaseBotao>
    </template>

    <template v-else-if="card.status === 'PAUSED'">
      <BaseBotao variante="solido" @click="$emit('retomar')">▶ retomar</BaseBotao>
    </template>

    <template v-else-if="aguardandoAprovacao">
      <BaseBotao variante="solido" @click="$emit('aprovar')">✓ aprovar</BaseBotao>
      <BaseBotao @click="$emit('rejeitar')">✋ rejeitar</BaseBotao>
      <BaseBotao v-if="card.preview_url" @click="$emit('resetar')">↻ resetar</BaseBotao>
    </template>

    <a v-else-if="card.status === 'PR_OPEN' && card.pr_url" class="vivo" :href="card.pr_url" target="_blank" rel="noopener">↗ abrir PR</a>

    <BaseBotao v-if="previsualizavel" @click="$emit('preview')">👁 preview</BaseBotao>
    <BaseBotao v-if="revisavel" @click="$emit('review')">⌕ code-review</BaseBotao>
  </div>
</template>

<style scoped>
.acoes { display: flex; gap: var(--esp-2); align-items: center; flex-wrap: wrap; }

.vivo {
  display: inline-flex;
  align-items: center;
  gap: var(--esp-2);
  padding: var(--esp-2) var(--esp-3);
  border-radius: var(--raio-2);
  border: 1px solid var(--acento);
  background: var(--acento);
  color: var(--acento-contraste);
  font-size: var(--tf-peq);
  font-weight: var(--peso-forte);
  box-shadow: var(--brilho-acento);
}

.vivo:hover { background: var(--acento-claro); color: var(--acento-contraste); }
</style>
