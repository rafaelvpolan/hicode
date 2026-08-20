<script setup lang="ts">
import type { TamanhoDeBotao, VarianteDeBotao } from '#shared/design'

interface BaseBotaoProps {
  variante?: VarianteDeBotao
  tamanho?: TamanhoDeBotao
  tipo?: 'button' | 'submit'
  desabilitado?: boolean
  ativo?: boolean
}

withDefaults(defineProps<BaseBotaoProps>(), {
  variante: 'fantasma',
  tamanho: 'md',
  tipo: 'button',
  desabilitado: false,
  ativo: false,
})
</script>

<template>
  <button class="btn" :class="[variante, tamanho, { ativo }]" :type="tipo" :disabled="desabilitado">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--esp-2);
  font-family: var(--fonte-corpo);
  font-size: var(--tf-peq);
  font-weight: var(--peso-forte);
  letter-spacing: var(--tracking-titulo);
  padding: var(--esp-2) var(--esp-3);
  border-radius: var(--raio-2);
  border: 1px solid var(--hairline);
  background: var(--superficie-2);
  color: var(--texto);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--dur-rapida) var(--curva), background var(--dur-rapida) var(--curva), color var(--dur-rapida) var(--curva);
}

.btn.sm { padding: var(--esp-1) var(--esp-2); font-size: var(--tf-mini); }

.btn:disabled { opacity: 0.45; cursor: not-allowed; }

.btn.solido {
  background: var(--acento);
  border-color: var(--acento);
  color: var(--acento-contraste);
}

.btn.solido:hover:not(:disabled) { background: var(--acento-claro); border-color: var(--acento-claro); box-shadow: var(--brilho-acento); }

.btn.fantasma:hover:not(:disabled) { border-color: var(--acento-borda); color: var(--acento); }

.btn.fantasma.ativo { border-color: var(--acento-borda); background: var(--acento-veu); color: var(--acento); }

.btn.perigo { border-color: var(--falha-borda); background: var(--falha-veu); color: var(--falha); }
.btn.perigo:hover:not(:disabled) { background: var(--falha); border-color: var(--falha); color: var(--texto-invertido); }

.btn.texto {
  background: transparent;
  border-color: transparent;
  color: var(--texto-mudo);
  padding: var(--esp-1) var(--esp-1);
  font-family: var(--fonte-mono);
  font-size: var(--tf-micro);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
}

.btn.texto:hover:not(:disabled) { color: var(--texto); }
</style>
