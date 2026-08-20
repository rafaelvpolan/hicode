<script setup lang="ts">
import { useMotorEstado } from '../composables/useMotorEstado'

const { estado, erro, carregando } = useMotorEstado()
</script>

<template>
  <BasePilha espaco="6">
    <BaseVazio v-if="carregando" titulo="lendo o motor…" />
    <BaseVazio v-else-if="erro || !estado" titulo="custo indisponível" detalhe="o painel não conseguiu ler o estado do motor." :motivo="erro" />
    <template v-else>
      <CustoResumo :custo-total-usd="estado.custoTotalUsd" :quota="estado.quota" />
      <CustoRepos :itens="estado.custoPorRepo" />
      <CustoCota :provedores="estado.quota.provedores" />
    </template>
  </BasePilha>
</template>
