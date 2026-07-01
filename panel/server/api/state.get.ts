import type { StateResponse } from '#shared/types'

export default defineEventHandler((): StateResponse => getState())
