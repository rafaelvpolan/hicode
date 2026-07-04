import { reactive, ref, type Ref } from 'vue'
import type {
  AddRepoResponse, CardActionResponse, CardView, CreateSprintResponse,
  EditingForm, GhReposResponse, NewRepoForm, ProjectPreviewResponse, ProjectPreviewState,
} from '#shared/types'

export interface CardActionsOptions {
  load: () => Promise<void>
  gh: Ref<GhReposResponse['items']>
  sprintRepo: Ref<string>
}

export function useCardActions(options: CardActionsOptions) {
  const { load, gh, sprintRepo } = options

  const newRepo = reactive<NewRepoForm>({ name: '', url: '', branch: '', runCmd: '' })
  const repoMsg = ref('')
  const sprintMsg = ref('')
  const sprintText = ref('')
  const projectPreview = reactive<ProjectPreviewState>({ url: '', msg: '' })
  const editing = reactive<EditingForm>({ open: false, id: '', title: '', desc: '', risk: 'low', note: '' })

  async function addRepo(): Promise<void> {
    const name = newRepo.name.trim()
    if (!name) { repoMsg.value = 'informe owner/repo'; return }
    const r = await $fetch<AddRepoResponse>('/api/repos', { method: 'POST', body: { ...newRepo, name } })
      .catch((e: { data?: AddRepoResponse }) => e?.data || { error: 'falhou' })
    if (r.error) { repoMsg.value = r.error; return }
    newRepo.name = newRepo.url = newRepo.runCmd = newRepo.branch = ''
    repoMsg.value = 'repo adicionado'
    await load()
  }

  async function loadGh(): Promise<void> {
    repoMsg.value = 'buscando via gh…'
    const r = await $fetch<GhReposResponse>('/api/gh-repos')
    gh.value = r.items || []
    repoMsg.value = r.error ? r.error : ''
  }

  async function quickAdd(name: string, url: string): Promise<void> {
    await $fetch('/api/repos', { method: 'POST', body: { name, url, branch: 'main' } }).catch(() => {})
    repoMsg.value = name + ' adicionado'
    await load()
  }

  async function createSprint(): Promise<void> {
    let text = sprintText.value.trim()
    if (!text) { sprintMsg.value = 'escreva a feature'; return }
    const high = text.startsWith('!')
    if (high) text = text.slice(1).trim()
    const title = (text.split('\n')[0] || '').trim().slice(0, 80)
    const r = await $fetch<CreateSprintResponse>('/api/sprint', {
      method: 'POST',
      body: { repo: sprintRepo.value, features: [{ title, risk: high ? 'high' : 'low', desc: text }] },
    })
    sprintMsg.value = (r.created || 0) + ' card criado (texto inteiro = 1 task)'
    sprintText.value = ''
    await load()
  }

  async function runProjectPreview(): Promise<void> {
    projectPreview.msg = 'iniciando…'
    try {
      const r = await $fetch<ProjectPreviewResponse>('/api/project-preview', { method: 'POST' })
      if (r.error) { projectPreview.msg = r.error; return }
      projectPreview.url = r.url
      const alvo = r.source === 'wip' ? `branch ${r.branch} (task #${r.cardId})` : `main (${r.branch ?? 'main'})`
      const estado = r.running ? 'já rodando' : 'iniciado (aguarde alguns segundos)'
      projectPreview.msg = `${estado} · ${alvo}`
      window.open(r.url, '_blank')
    } catch { projectPreview.msg = 'falhou ao iniciar' }
  }

  async function start(id: string): Promise<void> {
    await $fetch<CardActionResponse>(`/api/cards/${id}/start`, { method: 'POST' })
    await load()
  }

  async function pause(id: string): Promise<void> {
    await $fetch<CardActionResponse>(`/api/cards/${id}/pause`, { method: 'POST' })
    await load()
  }

  async function resume(id: string): Promise<void> {
    await $fetch<CardActionResponse>(`/api/cards/${id}/resume`, { method: 'POST' })
    await load()
  }

  async function act(id: string, kind: string): Promise<void> {
    await $fetch<CardActionResponse>(`/api/cards/${id}/${kind}`, { method: 'POST' })
    await load()
  }

  async function reject(id: string): Promise<void> {
    const reason = window.prompt('Rejeitar preview — o que refazer? (o preview será REFEITO com esta instrução; vazio = só rejeitar)') || ''
    await $fetch<CardActionResponse>(`/api/cards/${id}/reject`, { method: 'POST', body: { reason } })
    await load()
  }

  async function replay(id: string, step: string): Promise<void> {
    await $fetch<CardActionResponse>(`/api/cards/${id}/replay`, { method: 'POST', body: { step } })
    await load()
  }

  async function removeCard(c: CardView): Promise<void> {
    if (!window.confirm(`Remover o card #${c.id} "${c.title}"?\nApaga o arquivo do card.`)) return
    await $fetch(`/api/cards/${c.id}`, { method: 'DELETE' })
    await load()
  }

  async function openEdit(c: CardView): Promise<void> {
    editing.id = c.id
    editing.title = c.title || ''
    editing.desc = c.desc || c.title || ''
    editing.risk = c.risk === 'high' ? 'high' : 'low'
    editing.note = ''
    if (c.status === 'EXECUTING') {
      await $fetch<CardActionResponse>(`/api/cards/${c.id}/pause`, { method: 'POST' })
      editing.note = 'tarefa estava em execução — foi pausada para edição.'
      await load()
    }
    editing.open = true
  }

  async function saveEdit(): Promise<void> {
    await $fetch<CardActionResponse>(`/api/cards/${editing.id}/edit`, {
      method: 'POST',
      body: { title: editing.title, desc: editing.desc, risk: editing.risk },
    })
    editing.open = false
    await load()
  }

  function closeEdit(): void {
    editing.open = false
  }

  return {
    newRepo, repoMsg, sprintMsg, sprintText, projectPreview, editing,
    addRepo, loadGh, quickAdd, createSprint, runProjectPreview,
    start, pause, resume, act, reject, replay, removeCard, openEdit, saveEdit, closeEdit,
  }
}
