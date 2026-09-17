<script setup lang="ts">
import type { Tom } from '#shared/design'

interface BasePainelProps {
  tom?: Tom
  denso?: boolean
  destacado?: boolean
  elevado?: boolean
}

withDefaults(defineProps<BasePainelProps>(), {
  tom: 'neutro',
  denso: false,
  destacado: false,
  elevado: false,
})
</script>

<template>
  <section class="painel" :class="{ denso, destacado, elevado }" :data-tom="tom">
    <slot />
  </section>
</template>

<style scoped>
.painel {
  position: relative;
  background: var(--superficie);
  border: 1px solid var(--hairline);
  border-radius: var(--raio-4) 4px var(--raio-4) 4px;
  padding: var(--esp-5);
  transition: border-color var(--dur-media) var(--curva);
}

.painel::after {
  content: '';
  position: absolute;
  top: -1px;
  right: -1px;
  width: 14px;
  height: 14px;
  pointer-events: none;
  background: linear-gradient(45deg, transparent 46%, var(--hairline-forte) 47%, var(--hairline-forte) 53%, var(--fundo) 54%);
}
.painel.denso { padding: var(--esp-3) var(--esp-4); border-radius: var(--raio-2); }

.painel.elevado { background: var(--superficie-2); box-shadow: var(--sombra-elevada); }

.painel.destacado {
  border-color: var(--borda-tom);
  box-shadow: var(--brilho-tom);
}

.painel.destacado::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--esp-4);
  bottom: var(--esp-4);
  width: 2px;
  border-radius: var(--raio-pilula);
  background: var(--cor-tom);
}
</style>
