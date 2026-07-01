import type { RunsResponse } from '#shared/types'

export default defineEventHandler((): RunsResponse => ({ runs: getRuns() }))
