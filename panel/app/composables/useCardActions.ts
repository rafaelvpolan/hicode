import { reactive, ref, type Ref } from 'vue'
import type {
  AddRepoResponse, ApiError, CardActionResponse, CardView, CreateSprintResponse,
  EditingForm, GhReposResponse, NewRepoForm, ProjectPreviewResponse, ProjectPreviewState,
  RefsResponse, ResetPreviewResponse,
} from '#shared/types'
import { useSprintRefs } from './useSprintRefs'

export interface CardActionsOptions {
  load: () => Promise<void>
  gh: Ref<GhReposResponse['items']>
  sprintRepo: Ref<string>
}

export function useCardActions(options: CardActionsOptions) {
  const { load, gh, sprintRepo } = options
  const erroMotor = useState<string>('erro-admissao-motor', () => '')
  async function executarAcao(id: string, acao: string): Promise<void> {
    erroMotor.value = ''
    try {
      await $fetch<CardActionResponse>('/api/cards/' + id + '/' + acao, { method: 'POST' })
      await load()
    } catch (e) {
      const falha = e as { data?: { error?: string; message?: string } }
      erroMotor.value = falha.data?.error || falha.data?.message || 'Não foi possível confirmar a ação. Consulte o estado do motor.'
    }
  }

  const newRepo = reactive<NewRepoForm>({ name: '', url: '', branch: '', runCmd: '' })
  const repoMsg = ref('')
  const sprintMsg = ref('')
  const sprintText = ref('')
  const projectPreview = reactive<ProjectPreviewState>({ url: '', msg: '' })
  const editing = reactive<EditingForm>({ open: false, id: '', title: '', desc: '', risk: 'low', note: '' })
  const {
    stagedLinks, stagedFiles, addStagedLink, removeStagedLink, addStagedFiles, removeStagedFile, clearStaged,
  } = useSprintRefs()

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
    const r = await $fetch<AddRepoResponse>('/api/repos', { method: 'POST', body: { name, url, branch: 'main' } })
      .catch((e: { data?: AddRepoResponse }) => e?.data || { error: 'falhou' })
    if (r.error) { repoMsg.value = r.error; return }
    repoMsg.value = name + ' adicionado'
    await load()
  }

  async function flushStagedRefs(id: string): Promise<void> {
    const links = stagedLinks.value
    const files = stagedFiles.value
    if (links.length) {
      await $fetch<RefsResponse>(`/api/cards/${id}/refs`, { method: 'POST', body: { links } }).catch(() => null)
    }
    if (files.length) {
      const formData = new FormData()
      for (const file of files) formData.append('file', file, file.name)
      await $fetch<RefsResponse>(`/api/cards/${id}/refs`, { method: 'POST', body: formData }).catch(() => null)
    }
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
    }).catch((e: { data?: { error?: string; message?: string } }) => {
      erroMotor.value = e.data?.error || e.data?.message || 'Criação recusada. Verifique a conexão e a fila do motor.'
      sprintMsg.value = erroMotor.value
      return null
    })
    if (!r) return
    const firstId = r.cards[0]?.id
    if (firstId && (stagedLinks.value.length || stagedFiles.value.length)) await flushStagedRefs(firstId)
    sprintMsg.value = (r.created || 0) + ' card criado (texto inteiro = 1 task)'
    sprintText.value = ''
    clearStaged()
    await load()
  }

  async function runProjectPreview(): Promise<void> {
    projectPreview.msg = 'iniciando…'
    try {
      const r = await $fetch<ProjectPreviewResponse>('/api/project-preview', { method: 'POST' })
      if (r.error) { projectPreview.msg = r.error; return }
      projectPreview.url = r.url
      const alvo = `repo na branch ${r.branch ?? 'main'}`
      const estado = r.running ? 'já rodando' : 'iniciado (aguarde alguns segundos)'
      projectPreview.msg = `${estado} · ${alvo}`
      window.open(r.url, '_blank')
    } catch { projectPreview.msg = 'falhou ao iniciar' }
  }

  async function start(id: string): Promise<void> { await executarAcao(id, 'start') }

  async function pause(id: string): Promise<void> { await executarAcao(id, 'pause') }

  async function resume(id: string): Promise<void> { await executarAcao(id, 'resume') }

  async function act(id: string, kind: string): Promise<void> { await executarAcao(id, kind) }

  async function replay(id: string, step: string): Promise<void> {
    if (!window.confirm(`Repetir o passo "${step}" do card #${id}?\nO card volta para URL_OK e o motor refaz o polimento a partir daí.`)) return
    await $fetch<CardActionResponse>(`/api/cards/${id}/replay`, { method: 'POST', body: { step } })
    await load()
  }

  async function answerClarify(id: string, answers: { q: string; answer: string }[]): Promise<void> {
    const validas = answers.map(({ q, answer }) => ({ q: q.trim(), answer: answer.trim() })).filter(({ q, answer }) => q && answer)
    if (!validas.length) { erroMotor.value = 'Preencha ao menos uma resposta antes de enviar.'; return }
    try {
      await $fetch<CardActionResponse>(`/api/cards/${id}/clarify`, { method: 'POST', body: { answers: validas } })
      erroMotor.value = ''
      await load()
    } catch (error) {
      const data = (error as { data?: { error?: string } })?.data
      erroMotor.value = data?.error || 'Não foi possível enviar as respostas ao motor.'
    }
  }

  async function resetPreview(id: string, hard: boolean): Promise<void> {
    await $fetch<ResetPreviewResponse | ApiError>(`/api/cards/${id}/reset-preview`, { method: 'POST', body: { hard } })
      .catch(() => null)
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
    stagedLinks, stagedFiles,
    addRepo, loadGh, quickAdd, createSprint, runProjectPreview,
    addStagedLink, removeStagedLink, addStagedFiles, removeStagedFile,
    start, pause, resume, act, replay, answerClarify, resetPreview, removeCard, openEdit, saveEdit, closeEdit,
  }
}
