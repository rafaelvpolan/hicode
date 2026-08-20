<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { CardView } from '#shared/types'
import { cardCostLabel, cardFloorReason, isCostFloor } from '#shared/cost-floor'
import { useCardSelos } from '../../composables/useCardSelos'
import { tomDeRisco } from '../../composables/useStatusVisual'

interface CardCabecalhoProps {
  card: CardView
}

interface CardCabecalhoEmits {
  editar: []
  remover: []
}

const props = defineProps<CardCabecalhoProps>()
defineEmits<CardCabecalhoEmits>()

const cardRef = toRef(props, 'card')
const selos = useCardSelos(cardRef)
const custoRotulo = computed<string>(() => cardCostLabel(props.card))
const custoEstimado = computed<boolean>(() => isCostFloor(props.card))
const custoMotivo = computed<string>(() => cardFloorReason(props.card))
</script>

<template>
  <header class="cab">
    <span class="id">{{ card.id }}</span>
    <div class="centro">
      <h3 class="titulo">{{ card.title }}</h3>
      <div class="selos">
        <BaseChip
          v-for="s in selos"
          :key="s.chave"
          :rotulo="s.rotulo"
          :tom="s.tom"
          :ponto="s.ponto"
          :pulsando="s.pulsando"
          :title="s.titulo || undefined"
        />
      </div>
    </div>
    <div class="meta">
      <BaseChip :rotulo="card.repo || 'sem repo'" tom="neutro" mono />
      <BaseChip :rotulo="card.risk" :tom="tomDeRisco(card.risk)" mono />
      <BaseValor v-if="card.cost_usd" :valor="custoRotulo" :estimado="custoEstimado" :motivo="custoMotivo" />
      <BaseValor v-if="card.tokens_total" :valor="Number(card.tokens_total).toLocaleString('pt-BR')" rotulo="tok" />
    </div>
    <div class="ferramentas">
      <BaseBotao variante="texto" tamanho="sm" title="Editar tarefa" @click="$emit('editar')">editar</BaseBotao>
      <BaseBotao variante="texto" tamanho="sm" title="Remover" @click="$emit('remover')">remover</BaseBotao>
    </div>
  </header>
</template>

<style scoped>
.cab { display: flex; align-items: flex-start; gap: var(--esp-3); flex-wrap: wrap; }

.id {
  font-family: var(--fonte-mono);
  font-size: var(--tf-lg);
  font-weight: var(--peso-display);
  color: var(--texto-fraco);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.centro { display: flex; flex-direction: column; gap: var(--esp-2); min-width: 220px; flex: 1 1 auto; }

.titulo {
  font-family: var(--fonte-display);
  font-size: var(--tf-md);
  font-weight: var(--peso-forte);
  letter-spacing: var(--tracking-titulo);
  color: var(--texto);
}

.selos { display: flex; gap: var(--esp-2); flex-wrap: wrap; }

.meta { display: flex; gap: var(--esp-3); align-items: center; flex-wrap: wrap; }

.ferramentas { display: flex; gap: var(--esp-1); align-items: center; }
</style>
