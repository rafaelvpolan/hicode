import { motorClient } from '../../motor'
import { transmitirComoSse } from '../../utils/sse'

export default defineEventHandler((event) => transmitirComoSse(event, signal => motorClient.acompanharQuadro({ signal })))
