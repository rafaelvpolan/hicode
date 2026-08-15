export function pularCriacaoDePr(prUrl: string): boolean {
  return String(prUrl ?? '').trim().length > 0
}
