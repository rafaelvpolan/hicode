import { createError } from 'h3'
import { clienteHii } from './client.mjs'

export function motorHii() {
  const url = process.env.HII_API_URL || ''
  const token = process.env.HII_API_TOKEN || ''
  const repo = process.env.HII_API_REPO || ''
  if (!url || token.length < 32 || !repo) throw createError({ statusCode: 503, statusMessage: 'Configure HII_API_URL, HII_API_TOKEN e HII_API_REPO no backend' })
  return { cliente: clienteHii(url, token), repo }
}
