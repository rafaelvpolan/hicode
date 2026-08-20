import type { HistoricoResponse } from '#shared/types'
import { historicoDeExecucoes } from '../utils/historico'

export default defineEventHandler((): HistoricoResponse => historicoDeExecucoes())
