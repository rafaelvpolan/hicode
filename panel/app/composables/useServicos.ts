import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { ServicosResponse, StatusDeServico } from '#shared/types'

const INTERVALO_MS = 15000

export interface UseServicosReturn {
  servicos: Ref<StatusDeServico[]>
  geradoEm: Ref<string>
  erro: Ref<string>
  carregando: Ref<boolean>
  carregar: () => Promise<void>
}

export function useServicos(): UseServicosReturn {
  const servicos = ref<StatusDeServico[]>([])
  const geradoEm = ref('')
  const erro = ref('')
  const carregando = ref(true)

  async function carregar(): Promise<void> {
    try {
      const r = await $fetch<ServicosResponse>('/api/servicos')
      servicos.value = r.servicos
      geradoEm.value = r.geradoEm
      erro.value = ''
    } catch (e) {
      erro.value = e instanceof Error ? e.message : String(e)
    } finally {
      carregando.value = false
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(async () => {
    await carregar()
    timer = setInterval(carregar, INTERVALO_MS)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
  })

  return { servicos, geradoEm, erro, carregando, carregar }
}
