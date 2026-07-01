<script setup lang="ts">
import type { Kpi } from '#shared/types'

interface KpiBarProps {
  kpis: Kpi[]
}

defineProps<KpiBarProps>()
</script>

<template>
  <section class="card-sec">
    <h2>Visão geral</h2>
    <div class="kpis">
      <div v-for="k in kpis" :key="k.l" class="kpi" :class="k.k"><b>{{ k.v }}</b><span>{{ k.l }}</span></div>
    </div>
  </section>
</template>

<style scoped>
.card-sec{ background:var(--panel); border:1px solid var(--bd); border-radius:10px; padding:16px }
.card-sec h2{ font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:var(--mut); margin:0 0 12px }
.kpis{ display:flex; gap:10px; flex-wrap:wrap }
.kpi{ flex:1; min-width:96px; background:var(--panel2); border:1px solid var(--bd); border-radius:9px; padding:10px 12px }
.kpi b{ display:block; font-size:20px } .kpi span{ color:var(--mut); font-size:11px; text-transform:uppercase }
.kpi.warn b{ color:var(--warn) } .kpi.bad b{ color:var(--bad) } .kpi.ok b{ color:var(--ok) }
</style>
