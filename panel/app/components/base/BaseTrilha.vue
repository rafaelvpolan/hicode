<template>
  <ol class="trilha">
    <slot />
  </ol>
</template>

<style scoped>
.trilha {
  display: flex;
  flex-wrap: wrap;
  gap: var(--esp-4) 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
