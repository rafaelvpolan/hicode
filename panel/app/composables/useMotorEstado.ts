import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { MotorEstadoResponse } from '#shared/types'
import { useFluxoDoMotor } from './useFluxoDoMotor'

const INTERVALO_DE_SEGURANCA_MS = 30000
const DEBOUNCE_MS = 400

export interface UseMotorEstadoReturn {
  estado: Ref<MotorEstadoResponse | null>
  erro: Ref<string>
  carregando: Ref<boolean>
  carregar: () => Promise<void>
}

export function useMotorEstado(): UseMotorEstadoReturn {
  const estado = ref<MotorEstadoResponse | null>(null)
  const erro = ref('')
  const carregando = ref(true)
  const { versaoGlobal } = useFluxoDoMotor()

  async function carregar(): Promise<void> {
    try {
      estado.value = await $fetch<MotorEstadoResponse>('/api/motor')
      erro.value = ''
    } catch (e) {
      erro.value = e instanceof Error ? e.message : String(e)
    } finally {
      carregando.value = false
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null
  let debounce: ReturnType<typeof setTimeout> | null = null

  watch(versaoGlobal, () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(carregar, DEBOUNCE_MS)
  })

  onMounted(async () => {
    await carregar()
    timer = setInterval(carregar, INTERVALO_DE_SEGURANCA_MS)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    if (debounce) clearTimeout(debounce)
  })

  return { estado, erro, carregando, carregar }
}
