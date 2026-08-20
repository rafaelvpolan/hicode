<script setup lang="ts">
interface BaseVazioProps {
  titulo: string
  detalhe?: string
  motivo?: string
}

withDefaults(defineProps<BaseVazioProps>(), { detalhe: '', motivo: '' })
</script>

<template>
  <div class="vazio">
    <span class="marca" aria-hidden="true">◍</span>
    <b class="titulo">{{ titulo }}</b>
    <p v-if="detalhe" class="detalhe">{{ detalhe }}</p>
    <p v-if="motivo" class="motivo">{{ motivo }}</p>
    <div v-if="$slots.acoes" class="acoes"><slot name="acoes" /></div>
  </div>
</template>

<style scoped>
.vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--esp-2);
  text-align: center;
  padding: var(--esp-6) var(--esp-4);
  border: 1px dashed var(--hairline);
  border-radius: var(--raio-3);
  background: var(--superficie-afundada);
}

.marca { color: var(--texto-fraco); font-size: var(--tf-lg); }

.titulo {
  font-family: var(--fonte-display);
  font-size: var(--tf-md);
  letter-spacing: var(--tracking-titulo);
  text-transform: uppercase;
  color: var(--texto-mudo);
}

.detalhe { margin: 0; font-size: var(--tf-peq); color: var(--texto-fraco); max-width: 46ch; }

.motivo {
  margin: 0;
  font-family: var(--fonte-mono);
  font-size: var(--tf-mini);
  color: var(--atencao);
  max-width: 60ch;
  word-break: break-word;
}

.acoes { margin-top: var(--esp-2); display: flex; gap: var(--esp-2); }
</style>
