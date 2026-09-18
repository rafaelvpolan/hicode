import { estadoComVinculos } from '../hii/recuperacao'
import type { StateResponse } from '#shared/types'

export default defineEventHandler(async (): Promise<StateResponse> => estadoComVinculos(getState()))
