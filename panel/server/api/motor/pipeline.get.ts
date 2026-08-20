import type { PipelineConfigResponse } from '#shared/types'
import { pipelineAtual } from '../../motor/pipeline'

export default defineEventHandler((): PipelineConfigResponse => pipelineAtual())
