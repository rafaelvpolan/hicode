<script setup lang="ts">
import type { HistoricoExecucao } from '#shared/types'
import { fmtDt, fmtTime } from '../../composables/useFormat'
import { tomDeResultado } from '../../composables/useStatusVisual'

interface HistoricoListaProps {
  execucoes: HistoricoExecucao[]
}

defineProps<HistoricoListaProps>()

function moeda(execucao: HistoricoExecucao): string {
  return `${execucao.custoMedido ? '' : '≥ '}$${execucao.custoUsd.toFixed(4)}`
}
</script>

<template>
  <BasePainel>
    <BaseCabecalhoSecao rotulo="histórico" titulo="Execuções concluídas" :descricao="`${execucoes.length} registro(s)`" />
    <BaseVazio v-if="!execucoes.length" titulo="nada executado ainda" detalhe="o histórico é derivado das execuções gravadas em disco pelo motor." />
    <BasePilha v-else espaco="3">
      <BasePainel v-for="(e, i) in execucoes" :key="`${e.cardId}-${i}`" denso elevado :tom="tomDeResultado(e.resultado)">
        <BasePilha espaco="3">
          <BasePilha direcao="linha" espaco="3" alinhamento="centro" quebrar>
            <BaseChip :rotulo="`#${e.cardId}`" mono />
            <b class="titulo">{{ e.titulo }}</b>
            <BaseChip :rotulo="e.resultado" :tom="tomDeResultado(e.resultado)" ponto />
            <span class="ts">{{ fmtDt(e.ts) }}</span>
          </BasePilha>

          <BasePilha direcao="linha" espaco="5" quebrar>
            <BaseValor :valor="fmtTime(e.duracaoS)" rotulo="tempo" tom="atencao" />
            <BaseValor :valor="moeda(e)" rotulo="valor" tom="ok" :estimado="!e.custoMedido" motivo="custo não medido pelo provedor — valor de piso" />
            <BaseValor :valor="e.tokensTotal.toLocaleString('pt-BR')" rotulo="tokens" tom="acento" />
            <BaseValor :valor="e.provider || '—'" rotulo="provedor" />
            <BaseValor :valor="e.model || '—'" rotulo="modelo" />
          </BasePilha>

          <p v-if="e.veredito" class="veredito">codefox: {{ e.veredito }}<template v-if="e.vereditoMotivo"> — {{ e.vereditoMotivo }}</template></p>
        </BasePilha>
      </BasePainel>
    </BasePilha>
  </BasePainel>
</template>

<style scoped>
.titulo { font-size: var(--tf-peq); font-weight: var(--peso-forte); color: var(--texto); }
.ts { margin-left: auto; font-family: var(--fonte-mono); font-size: var(--tf-mini); color: var(--texto-fraco); }
.veredito { margin: 0; font-family: var(--fonte-mono); font-size: var(--tf-mini); color: var(--texto-mudo); word-break: break-word; }
</style>
