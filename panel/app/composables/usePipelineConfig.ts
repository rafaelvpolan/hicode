import { onMounted, ref, type Ref } from 'vue'
import type { PipelineConfigResponse, PipelineStepView } from '#shared/types'

export interface UsePipelineConfigReturn {
  steps: Ref<PipelineStepView[]>
  fonte: Ref<string>
  somenteLeitura: Ref<boolean>
  motivoSomenteLeitura: Ref<string>
  erro: Ref<string>
  carregando: Ref<boolean>
  carregar: () => Promise<void>
}

export function usePipelineConfig(): UsePipelineConfigReturn {
  const steps = ref<PipelineStepView[]>([])
  const fonte = ref('')
  const somenteLeitura = ref(true)
  const motivoSomenteLeitura = ref('')
  const erro = ref('')
  const carregando = ref(true)

  async function carregar(): Promise<void> {
    try {
      const r = await $fetch<PipelineConfigResponse>('/api/motor/pipeline')
      steps.value = r.steps
      fonte.value = r.fonte
      somenteLeitura.value = r.somenteLeitura
      motivoSomenteLeitura.value = r.motivoSomenteLeitura
      erro.value = ''
    } catch (e) {
      erro.value = e instanceof Error ? e.message : String(e)
    } finally {
      carregando.value = false
    }
  }

  onMounted(carregar)

  return { steps, fonte, somenteLeitura, motivoSomenteLeitura, erro, carregando, carregar }
}
