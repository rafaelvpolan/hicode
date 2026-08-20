<script setup lang="ts">
import { useHistorico } from '../composables/useHistorico'

const { execucoes, erro, carregando } = useHistorico()
</script>

<template>
  <BasePilha espaco="6">
    <BaseVazio v-if="carregando" titulo="lendo execuções…" />
    <BaseVazio v-else-if="erro" titulo="histórico indisponível" detalhe="não foi possível ler as execuções gravadas." :motivo="erro" />
    <HistoricoLista v-else :execucoes="execucoes" />
  </BasePilha>
</template>
