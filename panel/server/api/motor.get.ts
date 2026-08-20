import type { MotorEstadoResponse } from '#shared/types'
import { estadoDoMotor } from '../utils/motor-estado'

export default defineEventHandler((): MotorEstadoResponse => estadoDoMotor())
