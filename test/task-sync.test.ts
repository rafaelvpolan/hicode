import { test, expect } from 'bun:test'
import { parseIssues } from '../lib/tasks/adapters/github-issues'
import { taskSync, taskSyncName, taskSyncNames } from '../lib/tasks/registry'

test('parseIssues mapeia JSON do gh para ExternalTask', () => {
  const json = JSON.stringify([
    { number: 42, title: 'Bug no header', body: 'detalhe' },
    { number: 7, title: 'Sem corpo' },
  ])
  const tasks = parseIssues(json)
  expect(tasks.length).toBe(2)
  expect(tasks[0]).toEqual({ externalId: '42', title: 'Bug no header', body: 'detalhe' })
  expect(tasks[1]?.body).toBe('')
})

test('parseIssues tolera JSON invalido', () => {
  expect(parseIssues('nao json')).toEqual([])
  expect(parseIssues('{}')).toEqual([])
})

test('taskSync default = none (sem sync externo)', () => {
  expect(taskSyncName()).toBe('none')
  expect(taskSync()).toBeNull()
  expect(taskSyncNames()).toContain('github-issues')
})
