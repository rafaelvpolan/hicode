<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { basicSetup } from 'codemirror'
import { MergeView } from '@codemirror/merge'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'

interface DiffMergeViewProps {
  before: string
  after: string
  filename: string
  onSelectLine?: (line: number, text: string) => void
}

const props = defineProps<DiffMergeViewProps>()

const containerRef = useTemplateRef<HTMLDivElement>('container')
const mergeViewRef = shallowRef<MergeView | null>(null)

function langExtensionFor(filename: string): Extension[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.json')) return [json()]
  if (
    lower.endsWith('.ts') || lower.endsWith('.tsx') ||
    lower.endsWith('.mts') || lower.endsWith('.cts') ||
    lower.endsWith('.js') || lower.endsWith('.jsx') ||
    lower.endsWith('.vue')
  ) {
    return [javascript({ typescript: true })]
  }
  return []
}

function sharedExtensions(filename: string): Extension[] {
  return [
    basicSetup,
    ...langExtensionFor(filename),
    oneDark,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
  ]
}

function lineSelectExtension(): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos != null) {
        const ln = view.state.doc.lineAt(pos)
        props.onSelectLine?.(ln.number, ln.text)
      }
      return false
    },
  })
}

function createMergeView(): void {
  const parent = containerRef.value
  if (!parent) return
  mergeViewRef.value?.destroy()
  mergeViewRef.value = new MergeView({
    a: { doc: props.before, extensions: sharedExtensions(props.filename) },
    b: { doc: props.after, extensions: [...sharedExtensions(props.filename), lineSelectExtension()] },
    parent,
    highlightChanges: true,
    gutter: true,
    collapseUnchanged: { margin: 3, minSize: 4 },
  })
}

onMounted(createMergeView)

watch(
  () => [props.before, props.after, props.filename],
  createMergeView,
)

onBeforeUnmount(() => {
  mergeViewRef.value?.destroy()
  mergeViewRef.value = null
})
</script>

<template>
  <div ref="container" class="diff-merge-view" />
</template>

<style scoped>
.diff-merge-view {
  height: 65vh;
  overflow: auto;
  border: 1px solid var(--bd);
  border-radius: 8px;
}

.diff-merge-view :deep(.cm-editor) {
  height: 100%;
  font-size: 12.5px;
}

.diff-merge-view :deep(.cm-scroller) {
  overflow: auto;
}
</style>
