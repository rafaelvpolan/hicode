<script setup lang="ts">
import type { Tom } from '#shared/design'

interface BaseIndicadorProps {
  nome: string
  tom?: Tom
  detalhe?: string
  comoResolver?: string
  pulsando?: boolean
}

withDefaults(defineProps<BaseIndicadorProps>(), {
  tom: 'neutro',
  detalhe: '',
  comoResolver: '',
  pulsando: false,
})
</script>

<template>
  <article class="ind" :data-tom="tom">
    <header class="topo">
      <BasePonto :tom="tom" :pulsando="pulsando" />
      <b class="nome">{{ nome }}</b>
    </header>
    <p v-if="detalhe" class="detalhe">{{ detalhe }}</p>
    <p v-if="comoResolver" class="resolver">{{ comoResolver }}</p>
  </article>
</template>

<style scoped>
.ind {
  display: flex;
  flex-direction: column;
  gap: var(--esp-2);
  padding: var(--esp-4);
  border: 1px solid var(--hairline);
  border-radius: var(--raio-2);
  background: var(--superficie-2);
  transition: border-color var(--dur-media) var(--curva);
}

.ind:hover { border-color: var(--borda-tom); }

.topo { display: flex; align-items: center; gap: var(--esp-2); }

.nome {
  font-size: var(--tf-peq);
  font-weight: var(--peso-forte);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  color: var(--texto);
}

.detalhe { margin: 0; font-size: var(--tf-peq); color: var(--texto-mudo); word-break: break-word; }

.resolver {
  margin: 0;
  font-family: var(--fonte-mono);
  font-size: var(--tf-mini);
  color: var(--cor-tom);
  word-break: break-word;
}
</style>
