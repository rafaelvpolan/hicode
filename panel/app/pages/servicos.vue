<script setup lang="ts">
import { useMotorEstado } from '../composables/useMotorEstado'
import { useServicos } from '../composables/useServicos'

const { servicos, erro, carregando } = useServicos()
const { estado } = useMotorEstado()
</script>

<template>
  <BasePilha espaco="6">
    <BaseVazio v-if="carregando" titulo="checando serviços…" />
    <BaseVazio v-else-if="erro" titulo="serviços indisponíveis" detalhe="o coletor de status falhou." :motivo="erro" />
    <ServicosGrade v-else :servicos="servicos" />
    <ServicosLacunas :lacunas="estado?.lacunas ?? []" />
  </BasePilha>
</template>
