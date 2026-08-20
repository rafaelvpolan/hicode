<script setup lang="ts">
import { usePipelineConfig } from '../composables/usePipelineConfig'

const { steps, fonte, somenteLeitura, motivoSomenteLeitura, erro, carregando } = usePipelineConfig()
</script>

<template>
  <BasePilha espaco="6">
    <BaseVazio v-if="carregando" titulo="lendo o pipeline…" />
    <BaseVazio v-else-if="erro" titulo="pipeline indisponível" detalhe="o motor não respondeu a configuração." :motivo="erro" />
    <template v-else>
      <PipelineTrilha :steps="steps" :fonte="fonte" />
      <BasePainel v-if="somenteLeitura" tom="atencao" destacado>
        <BaseCabecalhoSecao rotulo="somente leitura" titulo="Não dá para editar daqui" tom="atencao" />
        <p class="motivo">{{ motivoSomenteLeitura || 'o motor não expõe verbo de escrita para o pipeline.' }}</p>
      </BasePainel>
    </template>
  </BasePilha>
</template>

<style scoped>
.motivo { margin: 0; font-size: var(--tf-peq); color: var(--texto); word-break: break-word; }
</style>
