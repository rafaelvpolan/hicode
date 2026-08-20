<script setup lang="ts">
interface ServicosLacunasProps {
  lacunas: string[]
}

defineProps<ServicosLacunasProps>()
</script>

<template>
  <BasePainel tom="atencao" :destacado="lacunas.length > 0">
    <BaseCabecalhoSecao rotulo="lacunas" titulo="O que o motor ainda não expõe" tom="atencao" descricao="declarado pelo próprio motor — o painel não simula esses dados" />
    <BaseVazio v-if="!lacunas.length" titulo="sem lacunas declaradas" detalhe="o motor expõe tudo que o painel precisa." />
    <BasePilha v-else espaco="2">
      <p v-for="(l, i) in lacunas" :key="i" class="lacuna">{{ l }}</p>
    </BasePilha>
  </BasePainel>
</template>

<style scoped>
.lacuna {
  margin: 0;
  padding: var(--esp-3);
  border-left: 2px solid var(--atencao-borda);
  background: var(--atencao-veu);
  border-radius: var(--raio-1);
  font-size: var(--tf-peq);
  color: var(--texto);
  word-break: break-word;
}
</style>
