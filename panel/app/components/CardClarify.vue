<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { CardView } from '#shared/types'
import { useClarify } from '../composables/useClarify'

interface CardClarifyProps {
  card: CardView
}

interface CardClarifyEmits {
  answered: [answers: { q: string; answer: string }[]]
}

const props = defineProps<CardClarifyProps>()
const emit = defineEmits<CardClarifyEmits>()

const cardIdRef = toRef(props.card, 'id')
const statusRef = toRef(props.card, 'status')
const { questions, loaded, selected, selectAnswer, collectAnswers } = useClarify(cardIdRef, statusRef)

const hasQuestions = computed(() => questions.value.length > 0)

function submit(): void {
  emit('answered', collectAnswers())
}
</script>

<template>
  <div class="clarify">
    <div class="clarify-head">🧭 decisão necessária — responda para executar</div>
    <div v-if="!loaded || !hasQuestions" class="clarify-loading">carregando decisões…</div>
    <template v-else>
      <fieldset v-for="(q, i) in questions" :key="q.q" class="clarify-q">
        <legend>{{ q.q }}</legend>
        <label v-for="opt in q.options" :key="opt" class="clarify-opt">
          <input
            type="radio"
            :name="`clarify-${card.id}-${i}`"
            :value="opt"
            :checked="selected[q.q] === opt"
            @change="selectAnswer(q.q, opt)"
          >
          <span>{{ opt }}</span>
          <span v-if="opt === q.recommended" class="clarify-rec">recomendado</span>
        </label>
      </fieldset>
      <div class="clarify-actions">
        <button type="button" @click="submit">✅ responder e executar</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.clarify{ margin:8px 0; padding:10px 12px; border:1px solid color-mix(in srgb,var(--acc) 45%,transparent); border-radius:8px; background:color-mix(in srgb,var(--acc) 8%,transparent) }
.clarify-head{ color:var(--acc); font-weight:700; margin-bottom:8px }
.clarify-loading{ color:var(--mut); font-size:13px }
.clarify-q{ border:1px solid var(--bd); border-radius:7px; padding:8px 10px; margin:0 0 8px; display:flex; flex-direction:column; gap:6px }
.clarify-q legend{ padding:0 4px; color:var(--tx); font-weight:600; font-size:13px }
.clarify-opt{ display:flex; align-items:center; gap:7px; font-size:13px; color:var(--tx); cursor:pointer }
.clarify-opt input{ accent-color:var(--acc); width:15px; height:15px; margin:0 }
.clarify-rec{ font-size:10px; color:var(--ok); border:1px solid color-mix(in srgb,var(--ok) 45%,transparent); border-radius:5px; padding:1px 6px; text-transform:uppercase; letter-spacing:.02em }
.clarify-actions{ display:flex; margin-top:10px }
.clarify-actions button{ background:var(--acc); border:1px solid var(--acc); color:#fff; padding:7px 14px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer }
.clarify-actions button:hover{ filter:brightness(1.08) }
</style>
