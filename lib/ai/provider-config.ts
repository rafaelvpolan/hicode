import { agentRoles, DEFAULT_PROVIDER, isProviderName, providerNameFor, providerNames, roleProviderEnv, roleQuotaFallbackEnv } from './registry'

export interface ProviderConfigIssue {
  origin: string
  requested: string
  effect: string
}

export function providerConfigIssues(): ProviderConfigIssue[] {
  const issues: ProviderConfigIssue[] = []
  const dflt = process.env.HICODE_AI_PROVIDER
  if (dflt && !isProviderName(dflt)) issues.push({ origin: 'HICODE_AI_PROVIDER', requested: dflt, effect: `usando ${DEFAULT_PROVIDER}` })
  for (const role of agentRoles()) {
    const perRoleEnv = roleProviderEnv(role)
    const perRole = process.env[perRoleEnv]
    if (perRole && !isProviderName(perRole)) issues.push({ origin: perRoleEnv, requested: perRole, effect: `usando ${providerNameFor(role)}` })
    const fallbackEnv = roleQuotaFallbackEnv(role)
    const fallback = process.env[fallbackEnv]
    if (fallback && !isProviderName(fallback)) issues.push({ origin: fallbackEnv, requested: fallback, effect: 'sem troca de provedor por cota' })
  }
  return issues
}

export function providerConfigWarning(issue: ProviderConfigIssue): string {
  return `AVISO: provedor "${issue.requested}" configurado em ${issue.origin} nao existe (provedores: ${providerNames().join(', ')}) — ${issue.effect}\n`
}

export function warnProviderConfig(write: (line: string) => void): void {
  for (const issue of providerConfigIssues()) write(providerConfigWarning(issue))
}
