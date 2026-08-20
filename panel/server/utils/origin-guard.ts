export function hostDeOrigem(origem: string): string | null {
  try { return new URL(origem).host } catch { return null }
}

export function origemAutorizada(origem: string | null, hostEsperado: string): boolean {
  if (!origem) return true
  const host = hostDeOrigem(origem)
  if (!host) return false
  return host === hostEsperado
}
