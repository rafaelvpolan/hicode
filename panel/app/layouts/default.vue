<script setup lang="ts">
import { computed } from 'vue'
import type { Tom } from '#shared/design'
import { useFluxoDoMotor } from '../composables/useFluxoDoMotor'

interface ItemDeNavegacao {
  rota: string
  rotulo: string
}

const NAVEGACAO: ItemDeNavegacao[] = [
  { rota: '/', rotulo: 'execução' },
  { rota: '/custo', rotulo: 'custo' },
  { rota: '/servicos', rotulo: 'serviços' },
  { rota: '/historico', rotulo: 'histórico' },
  { rota: '/pipeline', rotulo: 'pipeline' },
  { rota: '/repos', rotulo: 'repos' },
]

const { conectado, reconectando, degradado } = useFluxoDoMotor()

const rotuloDaTransmissao = computed<string>(() => {
  if (conectado.value) return 'ao vivo'
  if (degradado.value) return 'atualização manual'
  if (reconectando.value) return 'reconectando…'
  return 'conectando…'
})

const tomDaTransmissao = computed<Tom>(() => {
  if (conectado.value) return 'ok'
  if (degradado.value) return 'falha'
  return 'atencao'
})
</script>

<template>
  <div class="casca">
    <header class="topo">
      <BaseConteiner>
        <div class="barra">
          <NuxtLink to="/" class="marca">
            <span class="glifo" aria-hidden="true">◆</span>hicode
          </NuxtLink>
          <nav class="nav">
            <NuxtLink v-for="i in NAVEGACAO" :key="i.rota" :to="i.rota" class="item">{{ i.rotulo }}</NuxtLink>
          </nav>
          <BaseChip
            class="transmissao"
            :rotulo="rotuloDaTransmissao"
            :tom="tomDaTransmissao"
            ponto
            :pulsando="conectado"
            mono
          />
          <span class="lema">executar → preview → aprovar → PR</span>
        </div>
      </BaseConteiner>
    </header>

    <main class="corpo">
      <BaseConteiner>
        <slot />
      </BaseConteiner>
    </main>
  </div>
</template>

<style scoped>
.casca { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }

.topo {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--fundo-veu);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--hairline);
}

.barra { display: flex; align-items: center; gap: var(--esp-5); height: var(--altura-topo); }

.marca {
  display: inline-flex;
  align-items: center;
  gap: var(--esp-2);
  font-family: var(--fonte-display);
  font-size: var(--tf-md);
  font-weight: var(--peso-display);
  letter-spacing: var(--tracking-display);
  text-transform: uppercase;
  color: var(--texto);
}

.glifo { color: var(--acento); }

.nav { display: flex; gap: var(--esp-4); flex-wrap: wrap; }

.item {
  font-family: var(--fonte-mono);
  font-size: var(--tf-mini);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  color: var(--texto-mudo);
  padding-bottom: 2px;
  border-bottom: 1px solid transparent;
}

.item:hover { color: var(--texto); }

.item.router-link-active {
  color: var(--acento);
  border-bottom-color: var(--acento);
}

.transmissao { margin-left: auto; flex: 0 0 auto; }

.lema {
  font-family: var(--fonte-mono);
  font-size: var(--tf-micro);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  color: var(--texto-fraco);
}

@media (max-width: 900px) {
  .lema { display: none; }
  .barra { height: auto; padding: var(--esp-3) 0; flex-wrap: wrap; gap: var(--esp-3); }
}

.corpo { flex: 1; padding: var(--esp-6) 0 var(--esp-8); }
</style>
