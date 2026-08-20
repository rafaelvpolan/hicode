<script setup lang="ts">
import type { CardView } from '#shared/types'

interface CardBloqueioProps {
  card: CardView
}

interface CardBloqueioEmits {
  resolver: []
}

defineProps<CardBloqueioProps>()
defineEmits<CardBloqueioEmits>()
</script>

<template>
  <div v-if="card.status === 'HALTED'" class="halt" data-tom="falha">
    <div class="titulo">HALTED — parou e precisa de você</div>
    <p v-if="card.halt_reason" class="motivo">{{ card.halt_reason }}</p>
    <BaseBotao variante="perigo" @click="$emit('resolver')">↻ resolver e retomar</BaseBotao>
  </div>
  <div v-else-if="card.status === 'PAUSED'" class="linha" data-tom="parado">
    <BasePonto tom="parado" />pausado — clique retomar
  </div>
  <div v-else-if="card.status === 'CORRECTING'" class="linha" data-tom="rodando" role="status" aria-live="polite">
    <BasePonto tom="rodando" pulsando />corrigindo — a IA está refazendo o preview…
  </div>
</template>

<style scoped>
.halt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--esp-2);
  padding: var(--esp-3) var(--esp-4);
  border: 1px solid var(--borda-tom);
  border-radius: var(--raio-2);
  background: var(--veu-tom);
}

.titulo {
  font-family: var(--fonte-mono);
  font-size: var(--tf-mini);
  font-weight: var(--peso-forte);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  color: var(--cor-tom);
}

.motivo { margin: 0; font-size: var(--tf-peq); color: var(--texto); word-break: break-word; }

.linha {
  display: flex;
  align-items: center;
  gap: var(--esp-2);
  font-size: var(--tf-peq);
  font-weight: var(--peso-forte);
  color: var(--cor-tom);
}
</style>
