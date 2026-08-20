<script setup lang="ts">
interface BaseConteinerProps {
  largo?: boolean
}

const props = withDefaults(defineProps<BaseConteinerProps>(), { largo: false })

const largura = computed<string>(() => (props.largo ? '100%' : 'var(--largura-max)'))
</script>

<template>
  <div class="conteiner">
    <slot />
  </div>
</template>

<style scoped>
.conteiner {
  width: 100%;
  max-width: v-bind(largura);
  margin: 0 auto;
  padding: 0 var(--esp-5);
}

@media (max-width: 620px) {
  .conteiner { padding: 0 var(--esp-4); }
}
</style>
