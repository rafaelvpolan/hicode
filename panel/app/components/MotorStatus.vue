<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
import type { StatusMotorApi, EstadoDoMotor } from '../../shared/estado-motor'
const erroMotor = useState<string>('erro-admissao-motor', () => '')
const status = ref<StatusMotorApi | null>(null)
const rotulos: Record<EstadoDoMotor, string> = {
  ligado: 'Ligado', desligado: 'Desligado', degradado: 'Degradado', desconhecido: 'Estado desconhecido',
  indisponivel: 'API indisponível', nao_configurado: 'Conexão não configurada',
  nao_autorizado: 'Acesso recusado', incompativel: 'Atualização necessária', fila_divergente: 'Fila divergente',
}
const rotulo = computed(() => status.value ? rotulos[status.value.estado] : 'Consultando…')
let timer: ReturnType<typeof setInterval> | undefined
let pendente = false
let encerrado = false
async function atualizar(): Promise<void> {
  if (pendente) return
  pendente = true
  try {
    const s = await $fetch<StatusMotorApi>('/api/motor/status')
    if (!encerrado) status.value = s
  } catch {
    if (!encerrado) status.value = { estado: 'indisponivel', versao: null, versaoEmExecucao: null, motivo: 'Não foi possível consultar o estado do motor.', consultadoEm: new Date().toISOString() }
  } finally { pendente = false }
}
onMounted(() => { void atualizar(); timer = setInterval(() => { void atualizar() }, 5000) })
onBeforeUnmount(() => { encerrado = true; if (timer) clearInterval(timer) })
</script>
<template>
  <aside class="motor-status" aria-label="Estado do motor HII" :data-estado="status?.estado">
    <div role="status"><strong>HII · {{ rotulo }}</strong><span>Versão {{ status?.versaoEmExecucao || status?.versao || 'não disponível' }}</span></div>
    <p v-if="erroMotor" role="alert">{{ erroMotor }}</p>
    <p v-if="status">{{ status.motivo }}</p>
    <button type="button" :disabled="pendente" @click="atualizar">Atualizar status</button>
  </aside>
</template>
<style scoped>
.motor-status{position:relative;z-index:2;display:flex;align-items:center;flex-wrap:wrap;gap:12px 24px;padding:12px 24px;border-bottom:1px solid var(--hairline-forte);background:var(--superficie-2);color:var(--texto)}
.motor-status div{display:flex;flex-wrap:wrap;gap:12px}.motor-status strong{color:var(--atencao)}.motor-status[data-estado=ligado] strong{color:var(--ok)}
.motor-status span,.motor-status p{font-size:13px;color:var(--texto-mudo)}.motor-status p{flex:1;min-width:200px;margin:0}
button{font:inherit;font-size:12px;color:var(--acento);border:1px solid var(--acento);background:var(--superficie);padding:6px 10px;border-radius:8px;cursor:pointer}button:focus-visible{outline:2px solid var(--acento);outline-offset:3px}
</style>
