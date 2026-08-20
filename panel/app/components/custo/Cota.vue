<script setup lang="ts">
import type { UsoDeProvedor } from '#shared/types'
import { fmtDt } from '../../composables/useFormat'

interface CustoCotaProps {
  provedores: UsoDeProvedor[]
}

defineProps<CustoCotaProps>()

function moeda(valor: number): string {
  return `$${valor.toFixed(2)}`
}
</script>

<template>
  <BasePainel>
    <BaseCabecalhoSecao rotulo="cota" titulo="Provedores de IA" descricao="uso por provedor dentro da janela corrente" />
    <BaseVazio v-if="!provedores.length" titulo="nenhum provedor na janela" detalhe="nenhuma execução registrada no período." />
    <BaseGrade v-else minimo="280px" espaco="4">
      <BasePainel
        v-for="p in provedores"
        :key="p.provedor"
        denso
        elevado
        :tom="p.limiteAtingido ? 'falha' : 'ok'"
        :destacado="p.limiteAtingido"
      >
        <BasePilha espaco="3">
          <BasePilha direcao="linha" espaco="2" alinhamento="centro" quebrar>
            <BaseChip :rotulo="p.provedor" :tom="p.limiteAtingido ? 'falha' : 'ok'" mono ponto />
            <BaseChip v-if="!p.provedorIdentificado" rotulo="provedor não identificado" tom="parado" />
            <BaseChip v-if="p.limiteAtingido" rotulo="limite atingido" tom="falha" />
          </BasePilha>

          <BasePilha direcao="linha" espaco="5" quebrar>
            <BaseValor :valor="moeda(p.custoUsd)" rotulo="custo" tom="ok" />
            <BaseValor :valor="p.tokens.toLocaleString('pt-BR')" rotulo="tokens" />
            <BaseValor :valor="String(p.runs)" rotulo="runs" />
            <BaseValor :valor="String(p.runsComFalha)" rotulo="falhas" :tom="p.runsComFalha ? 'atencao' : 'neutro'" />
          </BasePilha>

          <p class="janela">janela vira em {{ fmtDt(p.janelaViraEm) }}</p>
          <p v-if="p.limiteMotivo" class="motivo">{{ p.limiteMotivo }}</p>
          <p v-if="p.cardsNoLimite.length" class="motivo">cards travados: {{ p.cardsNoLimite.join(', ') }}</p>
        </BasePilha>
      </BasePainel>
    </BaseGrade>
  </BasePainel>
</template>

<style scoped>
.janela { margin: 0; font-family: var(--fonte-mono); font-size: var(--tf-mini); color: var(--texto-fraco); }
.motivo { margin: 0; font-size: var(--tf-mini); color: var(--atencao); word-break: break-word; }
</style>
