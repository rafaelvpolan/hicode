import { test, expect } from 'bun:test'
import { prefixoDe, servidoresPara } from '../lib/ai/mcp'

const SERVIDORES = ['claude.ai Notion', 'plugin:Notion:notion', 'claude.ai Slack']

test('prefixoDe converte o nome do servidor MCP em prefixo de tool', () => {
  expect(prefixoDe('claude.ai Notion')).toBe('mcp__claude_ai_Notion')
  expect(prefixoDe('plugin:Notion:notion')).toBe('mcp__plugin_Notion_notion')
})

test('servidoresPara acha os servidores da ferramenta, case-insensitive, e ignora os outros', () => {
  const r = servidoresPara('notion', SERVIDORES)
  expect(r).toContain('claude.ai Notion')
  expect(r).toContain('plugin:Notion:notion')
  expect(r).not.toContain('claude.ai Slack')
})

test('servidoresPara com ferramenta vazia devolve lista vazia', () => {
  expect(servidoresPara('', SERVIDORES)).toEqual([])
})

test('REGRESSAO #023: notion resolve para o prefixo de tool esperado pelo Claude Code', () => {
  const prefixos = servidoresPara('notion', SERVIDORES).map(prefixoDe)
  expect(prefixos).toContain('mcp__claude_ai_Notion')
})
