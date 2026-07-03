<script setup lang="ts">
import { ref } from 'vue'
import type { FileDiffResponse, ReviewChangedFile } from '#shared/types'
import DiffMergeView from './DiffMergeView.vue'

interface ReviewFileRowProps {
  file: ReviewChangedFile
  diff: FileDiffResponse | undefined
  correcting: boolean
  canCorrect: boolean
}

interface ReviewFileRowEmits {
  expand: [path: string]
  correct: [path: string, instruction: string, line?: number, text?: string]
}

interface SelectedLine {
  line: number
  text: string
}

const props = defineProps<ReviewFileRowProps>()
const emit = defineEmits<ReviewFileRowEmits>()

const expanded = ref(false)
const instruction = ref('')
const selectedLine = ref<SelectedLine | null>(null)
const lineInstruction = ref('')

const MAX_LINE_PREVIEW_LENGTH = 80

function truncatedLineText(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > MAX_LINE_PREVIEW_LENGTH
    ? `${trimmed.slice(0, MAX_LINE_PREVIEW_LENGTH)}…`
    : trimmed
}

function handleSelectLine(line: number, text: string): void {
  selectedLine.value = { line, text }
}

function cancelLineSelection(): void {
  selectedLine.value = null
  lineInstruction.value = ''
}

function submitLineCorrection(): void {
  if (!props.canCorrect || !selectedLine.value) return
  const text = lineInstruction.value.trim()
  if (!text) return
  emit('correct', props.file.path, text, selectedLine.value.line, selectedLine.value.text)
  cancelLineSelection()
}

function statusLetter(status: string): string {
  const normalized = status.toUpperCase()
  if (normalized.startsWith('A')) return 'A'
  if (normalized.startsWith('M')) return 'M'
  if (normalized.startsWith('D')) return 'D'
  if (normalized.startsWith('R')) return 'R'
  return '?'
}

function toggleExpand(): void {
  expanded.value = !expanded.value
  if (expanded.value && !props.diff) emit('expand', props.file.path)
}

function submit(): void {
  if (!props.canCorrect) return
  const text = instruction.value.trim()
  if (!text) return
  emit('correct', props.file.path, text)
  instruction.value = ''
}
</script>

<template>
  <div class="file-row">
    <button type="button" class="file-summary" @click="toggleExpand">
      <span class="file-status" :class="statusLetter(file.status).toLowerCase()">{{ statusLetter(file.status) }}</span>
      <span class="file-path">{{ file.path }}</span>
      <span class="file-caret">{{ expanded ? '▾' : '▸' }}</span>
    </button>

    <div v-if="expanded" class="file-body">
      <div v-if="!diff" class="file-loading">carregando diff…</div>
      <div v-else-if="diff.error" class="file-error">{{ diff.error }}</div>
      <ClientOnly v-else>
        <DiffMergeView
          :before="diff.before"
          :after="diff.after"
          :filename="file.path"
          :on-select-line="canCorrect && !correcting ? handleSelectLine : undefined"
        />
      </ClientOnly>

      <div v-if="selectedLine" class="line-correct-box">
        <div class="line-anchor">linha {{ selectedLine.line }}: <code>{{ truncatedLineText(selectedLine.text) }}</code></div>
        <textarea
          v-model="lineInstruction"
          rows="2"
          placeholder="instrução de correção para esta linha…"
          :disabled="correcting || !canCorrect"
        />
        <div class="correct-actions">
          <span v-if="correcting" class="correcting-flag">corrigindo…</span>
          <button type="button" class="ghost" :disabled="correcting" @click="cancelLineSelection">cancelar</button>
          <button type="button" :disabled="correcting || !canCorrect || !lineInstruction.trim()" @click="submitLineCorrection">Solicitar alteração</button>
        </div>
      </div>

      <div class="correct-box">
        <div class="correct-box-label">correção por arquivo (mudanças amplas)</div>
        <textarea
          v-model="instruction"
          rows="3"
          :placeholder="canCorrect ? 'instrução de correção para este arquivo…' : 'correção disponível só no preview'"
          :disabled="correcting || !canCorrect"
        />
        <div class="correct-actions">
          <span v-if="!canCorrect" class="correct-hint">correção só no preview (aprovado/PR: rejeite ou use /codefox)</span>
          <span v-else-if="correcting" class="correcting-flag">corrigindo…</span>
          <button type="button" :disabled="correcting || !canCorrect || !instruction.trim()" @click="submit">Corrigir</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-row { border: 1px solid var(--bd); border-radius: 8px; margin-bottom: 8px; overflow: hidden; }
.file-summary {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  background: var(--panel2); border: none; border-radius: 0; padding: 8px 12px; cursor: pointer;
}
.file-status { font-family: monospace; font-weight: 700; width: 16px; text-align: center; border-radius: 4px; font-size: 11px; }
.file-status.a { color: var(--ok); } .file-status.m { color: var(--warn); }
.file-status.d { color: var(--bad); } .file-status.r { color: var(--acc); }
.file-path { font-family: monospace; font-size: 14px; color: #fff; flex: 1; }
.file-caret { color: var(--mut); font-size: 11px; }
.file-body { padding: 10px 12px; background: var(--bg); }
.file-loading, .file-error { color: var(--mut); font-size: 12.5px; padding: 10px 0; }
.file-error { color: var(--bad); }
.correct-box { margin-top: 10px; }
.correct-box-label { font-size: 10.5px; color: var(--mut); text-transform: uppercase; letter-spacing: .03em; margin-bottom: 4px; }
.correct-box textarea, .line-correct-box textarea {
  width: 100%; font: inherit; font-size: 12.5px; color: var(--tx); background: var(--panel2);
  border: 1px solid var(--bd); border-radius: 7px; padding: 8px 10px; resize: vertical;
}
.line-correct-box {
  margin-top: 10px; padding: 10px; border: 1px solid var(--acc); border-radius: 8px;
  background: color-mix(in srgb, var(--acc) 8%, var(--panel2));
}
.line-anchor { font-size: 12px; color: var(--acc); font-weight: 600; margin-bottom: 6px; }
.line-anchor code { font-family: monospace; color: var(--tx); font-weight: 400; }
.correct-actions { display: flex; align-items: center; gap: 10px; justify-content: flex-end; margin-top: 6px; }
.correcting-flag { color: var(--acc); font-size: 12px; font-weight: 600; }
.correct-hint { color: var(--mut); font-size: 11.5px; margin-right: auto; }
.correct-actions button {
  font: inherit; font-weight: 600; color: #fff; background: var(--acc); border: 1px solid var(--acc);
  border-radius: 7px; padding: 6px 14px; cursor: pointer;
}
.correct-actions button.ghost {
  background: var(--panel2); border-color: var(--bd); color: var(--tx); font-weight: 500;
}
.correct-actions button:disabled { opacity: .5; cursor: not-allowed; }
</style>
