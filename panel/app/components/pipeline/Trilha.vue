<script setup lang="ts">
import type { EstadoDeEtapa } from '#shared/design'
import type { PipelineStepView } from '#shared/types'

interface PipelineTrilhaProps {
  steps: PipelineStepView[]
  fonte: string
}

defineProps<PipelineTrilhaProps>()

function estadoDoStep(step: PipelineStepView): EstadoDeEtapa {
  return step.enabled ? 'ativo' : 'desativado'
}

function detalheDoStep(step: PipelineStepView): string {
  return [step.enabled ? 'ativo' : 'desativado', step.agent, step.gated ? 'gated' : ''].filter(Boolean).join(' · ')
}
</script>

<template>
  <BasePainel>
    <BaseCabecalhoSecao rotulo="pipeline" titulo="Etapas configuradas" :descricao="`fonte: ${fonte} — configuração, não execução`" />
    <BaseVazio v-if="!steps.length" titulo="pipeline indisponível" detalhe="o motor não devolveu etapas." />
    <BaseTrilha v-else>
      <BaseEtapa
        v-for="(s, i) in steps"
        :key="s.id"
        :numero="i + 1"
        :rotulo="s.label"
        :estado="estadoDoStep(s)"
        :detalhe="detalheDoStep(s)"
        :ultima="i === steps.length - 1"
      />
    </BaseTrilha>
  </BasePainel>
</template>
