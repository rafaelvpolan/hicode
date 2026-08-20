import { computed, type ComputedRef, type Ref } from 'vue'
import type { SeloDeCard, Tom } from '#shared/design'
import type { CardView } from '#shared/types'
import { ACTIVE_STATUSES } from './usePhases'

const ROTULO_DE_VERIFY: Record<string, string> = {
  ok: '✓ preview',
  inconclusivo: '◔ preview',
}

const TOM_DE_VERIFY: Record<string, Tom> = {
  ok: 'ok',
  inconclusivo: 'parado',
}

function tomDaNota(nota: string): Tom {
  const n = Number(nota)
  if (n >= 4) return 'ok'
  if (n === 3) return 'atencao'
  return 'falha'
}

function selo(chave: string, rotulo: string, tom: Tom, titulo = '', ponto = false, pulsando = false): SeloDeCard {
  return { chave, rotulo, tom, titulo, ponto, pulsando }
}

export function useCardSelos(card: Ref<CardView>): ComputedRef<SeloDeCard[]> {
  return computed<SeloDeCard[]>(() => {
    const c = card.value
    const selos: SeloDeCard[] = []

    if (c.surface === 'none') {
      selos.push(selo('surface', '↷ não-visual', 'parado', 'Classificação prévia: tarefa não-visual — preview/screenshot pulado'))
    }
    if (c.verify && c.verify !== 'n/a') {
      selos.push(selo('verify', ROTULO_DE_VERIFY[c.verify] ?? '⚠ preview', TOM_DE_VERIFY[c.verify] ?? 'atencao', 'Estado do preview — você confere abrindo o link'))
    }
    if (c.revalidacao) {
      selos.push(selo('reval', c.revalidacao === 'ok' ? '✓ reval' : '⚠ reval', c.revalidacao === 'ok' ? 'ok' : 'atencao', 'Revalidação do projeto vs objetivo da tarefa'))
    }
    if (c.eval_score) {
      selos.push(selo('eval', `★ ${c.eval_score}/5`, tomDaNota(c.eval_score), c.eval_notes))
    }
    if (ACTIVE_STATUSES.includes(c.status)) {
      selos.push(selo('ia', 'IA trabalhando', 'rodando', '', true, true))
    }

    return selos
  })
}
