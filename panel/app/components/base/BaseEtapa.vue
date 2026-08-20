<script setup lang="ts">
import { TOM_POR_ESTADO_DE_ETAPA, type EstadoDeEtapa } from '#shared/design'

interface BaseEtapaProps {
  numero: number
  rotulo: string
  estado: EstadoDeEtapa
  detalhe?: string
  acaoRotulo?: string
  ultima?: boolean
}

const props = withDefaults(defineProps<BaseEtapaProps>(), {
  detalhe: '',
  acaoRotulo: '',
  ultima: false,
})

interface BaseEtapaEmits {
  acao: []
}

defineEmits<BaseEtapaEmits>()

const tom = computed(() => TOM_POR_ESTADO_DE_ETAPA[props.estado])
const numeroFormatado = computed<string>(() => String(props.numero).padStart(2, '0'))
</script>

<template>
  <li class="etapa" :class="[estado, { ultima }]" :data-tom="tom">
    <span class="faixa">
      <span class="disco">
        <span class="num">{{ numeroFormatado }}</span>
      </span>
      <span v-if="!ultima" class="conector" aria-hidden="true" />
    </span>
    <span class="corpo">
      <span class="topo">
        <b class="rot">{{ rotulo }}</b>
        <button v-if="acaoRotulo" class="acao" type="button" :title="acaoRotulo" @click="$emit('acao')">▶</button>
      </span>
      <span v-if="detalhe" class="det">{{ detalhe }}</span>
    </span>
  </li>
</template>

<style scoped>
.etapa {
  display: flex;
  flex-direction: column;
  gap: var(--esp-2);
  align-items: flex-start;
  flex: 1 1 88px;
  min-width: 88px;
  list-style: none;
}

.faixa {
  display: flex;
  align-items: center;
  align-self: stretch;
  gap: var(--esp-1);
}

.disco {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--raio-pilula);
  border: 1px solid var(--borda-tom);
  background: var(--superficie-afundada);
  color: var(--cor-tom);
}

.conector {
  flex: 1 1 auto;
  min-width: var(--esp-2);
  height: 1px;
  background: var(--hairline);
}

.etapa.feito .conector { background: linear-gradient(90deg, var(--cor-tom), var(--hairline)); }
.etapa.agora .disco { box-shadow: var(--brilho-tom); border-color: var(--cor-tom); }
.etapa.falhou .disco { border-color: var(--cor-tom); box-shadow: var(--brilho-tom); }
.etapa.pendente .disco { border-color: var(--hairline); color: var(--texto-fraco); }
.etapa.desativado .disco { border-color: var(--hairline); color: var(--texto-fraco); opacity: 0.6; }

.num {
  font-family: var(--fonte-mono);
  font-size: var(--tf-mini);
  font-weight: var(--peso-forte);
  font-variant-numeric: tabular-nums;
}

.corpo { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-right: var(--esp-3); }
.topo { display: flex; align-items: center; gap: var(--esp-2); }

.rot {
  font-size: var(--tf-mini);
  font-weight: var(--peso-forte);
  letter-spacing: var(--tracking-rotulo);
  text-transform: uppercase;
  color: var(--texto);
}

.etapa.pendente .rot, .etapa.desativado .rot { color: var(--texto-fraco); font-weight: var(--peso-medio); }
.etapa.feito .rot { color: var(--texto-mudo); font-weight: var(--peso-medio); }
.etapa.desativado .rot { text-decoration: line-through; }

.det {
  font-family: var(--fonte-mono);
  font-size: var(--tf-micro);
  color: var(--texto-fraco);
}

.acao {
  opacity: 0;
  font: inherit;
  font-size: var(--tf-micro);
  line-height: 1;
  padding: 2px var(--esp-1);
  border: 1px solid var(--hairline);
  border-radius: var(--raio-1);
  background: var(--superficie-2);
  color: var(--acento);
  cursor: pointer;
  transition: opacity var(--dur-rapida) var(--curva);
}

.etapa:hover .acao, .acao:focus-visible { opacity: 1; }
</style>
