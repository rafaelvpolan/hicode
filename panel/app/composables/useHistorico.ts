import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { HistoricoExecucao, HistoricoResponse } from '#shared/types'
import { useFluxoDoMotor } from './useFluxoDoMotor'

const DEBOUNCE_MS = 600

export interface UseHistoricoReturn {
  execucoes: Ref<HistoricoExecucao[]>
  erro: Ref<string>
  carregando: Ref<boolean>
  carregar: () => Promise<void>
}

export function useHistorico(): UseHistoricoReturn {
  const execucoes = ref<HistoricoExecucao[]>([])
  const erro = ref('')
  const carregando = ref(true)
  const { versaoGlobal } = useFluxoDoMotor()

  async function carregar(): Promise<void> {
    try {
      const r = await $fetch<HistoricoResponse>('/api/historico')
      execucoes.value = r.execucoes
      erro.value = ''
    } catch (e) {
      erro.value = e instanceof Error ? e.message : String(e)
    } finally {
      carregando.value = false
    }
  }

  let debounce: ReturnType<typeof setTimeout> | null = null

  watch(versaoGlobal, () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(carregar, DEBOUNCE_MS)
  })

  onMounted(carregar)
  onBeforeUnmount(() => {
    if (debounce) clearTimeout(debounce)
  })

  return { execucoes, erro, carregando, carregar }
}
