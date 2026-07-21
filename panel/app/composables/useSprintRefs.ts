import { ref, type Ref } from 'vue'

export interface UseSprintRefsReturn {
  stagedLinks: Ref<string[]>
  stagedFiles: Ref<File[]>
  addStagedLink: (link: string) => void
  removeStagedLink: (index: number) => void
  addStagedFiles: (files: FileList) => void
  removeStagedFile: (index: number) => void
  clearStaged: () => void
}

export function useSprintRefs(): UseSprintRefsReturn {
  const stagedLinks = ref<string[]>([])
  const stagedFiles = ref<File[]>([])

  function addStagedLink(link: string): void {
    const trimmed = link.trim()
    if (!trimmed) return
    stagedLinks.value = [...stagedLinks.value, trimmed]
  }

  function removeStagedLink(index: number): void {
    stagedLinks.value = stagedLinks.value.filter((_, i) => i !== index)
  }

  function addStagedFiles(files: FileList): void {
    stagedFiles.value = [...stagedFiles.value, ...Array.from(files)]
  }

  function removeStagedFile(index: number): void {
    stagedFiles.value = stagedFiles.value.filter((_, i) => i !== index)
  }

  function clearStaged(): void {
    stagedLinks.value = []
    stagedFiles.value = []
  }

  return { stagedLinks, stagedFiles, addStagedLink, removeStagedLink, addStagedFiles, removeStagedFile, clearStaged }
}
