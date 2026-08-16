import { run } from '../runner/git'
import { noProxyArgs } from '../runner/loopback'

const PROBE_TIMEOUT_MS = Number(process.env.HICODE_HEALTH_PROBE_TIMEOUT_MS || 5000)

const REACHABILITY_URL: Record<string, string> = {
  claude: 'https://api.anthropic.com',
  codex: 'https://api.openai.com',
}

function ollamaHealthUrl(): string {
  return `${process.env.HICODE_OLLAMA_URL || 'http://localhost:11434'}/api/tags`
}

async function httpReachable(url: string): Promise<boolean> {
  const seconds = String(Math.max(1, Math.round(PROBE_TIMEOUT_MS / 1000)))
  const args = ['-q', ...noProxyArgs(url), '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', seconds, url]
  const { err, stdout } = await run('curl', args, { timeout: PROBE_TIMEOUT_MS + 2000 })
  if (err) return false
  const code = Number(stdout.trim()) || 0
  return code > 0 && code < 500
}

export async function probeProviderHealth(provider: string): Promise<boolean> {
  if (!provider) return true
  if (provider === 'ollama') return httpReachable(ollamaHealthUrl())
  const url = REACHABILITY_URL[provider]
  if (!url) return true
  return httpReachable(url)
}
