<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { CardStatus } from '#shared/types'
import { fmtDt } from '../../composables/useFormat'
import { useAiActivity } from '../../composables/useAiActivity'
import { useCardAttempts } from '../../composables/useCardAttempts'
import { useCardLog } from '../../composables/useCardLog'

interface CardAtividadeProps {
  cardId: string
  status: CardStatus
  atualizado: string
}

const props = defineProps<CardAtividadeProps>()

const cardIdRef = computed(() => props.cardId)
const statusRef = computed(() => props.status)
const atualizadoRef = computed(() => props.atualizado)

const { open: logAberto, source: logFonte, text: logTexto, isPolling: logAoVivo, toggle: alternarLog, selectSource: escolherFonte } = useCardLog(cardIdRef, statusRef)
const { open: tentativasAbertas, attempts: tentativas, toggle: alternarTentativas } = useCardAttempts(cardIdRef, atualizadoRef)
const { currentAction: acaoDaIa, isWorking: iaTrabalhando } = useAiActivity(logTexto)

const logEl = ref<HTMLPreElement | null>(null)

watch(logTexto, async () => {
  await nextTick()
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
})

function rotuloDaTentativa(kind: string): string {
  return kind === 'reprovacao' ? 'reprovação' : 'correção'
}
</script>

<template>
  <div class="atividade">
    <BaseBotao variante="texto" tamanho="sm" @click="alternarLog">
      {{ logAberto ? '▾' : '▸' }} log ao vivo
      <BasePonto v-if="logAoVivo" tom="ok" pulsando :tamanho="6" />
    </BaseBotao>

    <template v-if="logAberto">
      <div class="abas" role="tablist">
        <BaseBotao tamanho="sm" :ativo="logFonte === 'ia'" role="tab" :aria-selected="logFonte === 'ia'" @click="escolherFonte('ia')">IA ao vivo</BaseBotao>
        <BaseBotao tamanho="sm" :ativo="logFonte === 'estado'" role="tab" :aria-selected="logFonte === 'estado'" @click="escolherFonte('estado')">estado</BaseBotao>
      </div>

      <div
        v-if="logFonte === 'ia' && acaoDaIa"
        class="agora"
        :data-tom="acaoDaIa.kind === 'done' ? 'ok' : 'rodando'"
        role="status"
        aria-live="polite"
      >
        <BasePonto :tom="acaoDaIa.kind === 'done' ? 'ok' : 'rodando'" :pulsando="iaTrabalhando" :tamanho="6" />
        {{ acaoDaIa.text }}
      </div>

      <pre ref="logEl" class="log">{{ logTexto || 'carregando…' }}</pre>
    </template>

    <template v-if="tentativas.length">
      <BaseBotao variante="texto" tamanho="sm" @click="alternarTentativas">
        {{ tentativasAbertas ? '▾' : '▸' }} tentativas ({{ tentativas.length }})
      </BaseBotao>
      <div v-if="tentativasAbertas" class="tentativas">
        <article v-for="(t, i) in tentativas" :key="i" class="tentativa">
          <header class="topo">
            <BaseChip :rotulo="rotuloDaTentativa(t.kind)" :tom="t.kind === 'reprovacao' ? 'atencao' : 'parado'" />
            <span class="ts">{{ fmtDt(t.ts) }}</span>
          </header>
          <p class="motivo">{{ t.reason || '—' }}</p>
          <pre class="resposta">{{ t.response || '—' }}</pre>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.atividade {
  display: flex;
  flex-direction: column;
  gap: var(--esp-2);
  align-items: flex-start;
  padding-top: var(--esp-3);
  border-top: 1px solid var(--hairline-fraca);
}

.abas { display: flex; gap: var(--esp-2); }

.agora {
  display: flex;
  align-items: center;
  gap: var(--esp-2);
  align-self: stretch;
  font-family: var(--fonte-mono);
  font-size: var(--tf-peq);
  padding: var(--esp-2) var(--esp-3);
  border: 1px solid var(--borda-tom);
  border-radius: var(--raio-2);
  background: var(--veu-tom);
  color: var(--cor-tom);
  word-break: break-word;
}

.log, .resposta {
  align-self: stretch;
  margin: 0;
  padding: var(--esp-2) var(--esp-3);
  background: var(--superficie-afundada);
  border: 1px solid var(--hairline);
  border-radius: var(--raio-2);
  font-family: var(--fonte-mono);
  font-size: var(--tf-mini);
  color: var(--texto-mudo);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow: auto;
}

.tentativas { align-self: stretch; display: flex; flex-direction: column; gap: var(--esp-2); }

.tentativa {
  display: flex;
  flex-direction: column;
  gap: var(--esp-2);
  padding: var(--esp-3);
  background: var(--superficie-afundada);
  border: 1px solid var(--hairline);
  border-radius: var(--raio-2);
}

.topo { display: flex; align-items: center; gap: var(--esp-2); }
.ts { font-family: var(--fonte-mono); font-size: var(--tf-mini); color: var(--texto-fraco); }
.motivo { margin: 0; font-size: var(--tf-peq); color: var(--texto); word-break: break-word; }
</style>
