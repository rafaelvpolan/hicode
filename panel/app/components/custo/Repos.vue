<script setup lang="ts">
import type { CustoPorRepo } from '#shared/types'

interface CustoReposProps {
  itens: CustoPorRepo[]
}

defineProps<CustoReposProps>()

function moeda(valor: number): string {
  return `$${valor.toFixed(2)}`
}

function motivoDoPiso(item: CustoPorRepo): string {
  return item.piso ? `valor de piso — provedores sem custo medido: ${item.pisoProvedores.join(', ')}` : ''
}
</script>

<template>
  <BasePainel>
    <BaseCabecalhoSecao rotulo="por repositório" titulo="Onde o dinheiro foi" />
    <BaseVazio v-if="!itens.length" titulo="sem custo registrado" detalhe="nenhum card com custo apurado ainda." />
    <BaseGrade v-else minimo="220px" espaco="4">
      <BasePainel v-for="i in itens" :key="i.repo" denso elevado>
        <BaseValor :valor="moeda(i.custoUsd)" :rotulo="i.repo" tom="ok" :estimado="i.piso" :motivo="motivoDoPiso(i)" />
      </BasePainel>
    </BaseGrade>
  </BasePainel>
</template>
