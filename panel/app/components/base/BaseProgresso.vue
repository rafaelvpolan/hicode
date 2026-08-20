<script setup lang="ts">
import type { Tom } from '#shared/design'

interface BaseProgressoProps {
  valor: number
  tom?: Tom
  rotulo?: string
  indeterminado?: boolean
}

const props = withDefaults(defineProps<BaseProgressoProps>(), {
  tom: 'acento',
  rotulo: '',
  indeterminado: false,
})

const percentual = computed<number>(() => Math.round(Math.min(1, Math.max(0, props.valor)) * 100))
const largura = computed<string>(() => `${percentual.value}%`)
</script>

<template>
  <div class="prog" :data-tom="tom">
    <div v-if="rotulo" class="topo">
      <span class="rot">{{ rotulo }}</span>
      <span v-if="!indeterminado" class="pct">{{ percentual }}%</span>
    </div>
    <div
      class="trilho"
      role="progressbar"
      :aria-valuenow="indeterminado ? undefined : percentual"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <span class="preenchido" :class="{ indeterminado }" />
    </div>
  </div>
</template>

<style scoped>
.prog { display: flex; flex-direction: column; gap: var(--esp-1); min-width: 0; }

.topo { display: flex; align-items: baseline; gap: var(--esp-2); }

.rot {
  font-family: var(--fonte-mono);
  font-size: var(--tf-micro);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  color: var(--texto-mudo);
}

.pct {
  margin-left: auto;
  font-family: var(--fonte-mono);
  font-size: var(--tf-mini);
  color: var(--cor-tom);
  font-variant-numeric: tabular-nums;
}

.trilho {
  height: 4px;
  border-radius: var(--raio-pilula);
  background: var(--hairline-fraca);
  overflow: hidden;
}

.preenchido {
  display: block;
  height: 100%;
  width: v-bind(largura);
  border-radius: var(--raio-pilula);
  background: var(--cor-tom);
  transition: width var(--dur-lenta) var(--curva);
}

.preenchido.indeterminado { width: 35%; }

@media (prefers-reduced-motion: no-preference) {
  .preenchido.indeterminado { animation: correr 1.4s var(--curva) infinite; }
}

@keyframes correr {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(300%); }
}
</style>
