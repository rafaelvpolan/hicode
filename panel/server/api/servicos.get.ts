import type { ServicosResponse } from '#shared/types'
import { coletarStatusDosServicos } from '../servicos'

export default defineEventHandler((): Promise<ServicosResponse> => coletarStatusDosServicos())
