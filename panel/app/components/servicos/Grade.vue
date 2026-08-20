<script setup lang="ts">
import type { StatusDeServico } from '#shared/types'
import { tomDeServico } from '../../composables/useStatusVisual'

interface ServicosGradeProps {
  servicos: StatusDeServico[]
}

defineProps<ServicosGradeProps>()
</script>

<template>
  <BasePainel>
    <BaseCabecalhoSecao rotulo="serviços" titulo="Do que o painel depende" descricao="cada dependência externa do loop e como destravar quando cair" />
    <BaseVazio v-if="!servicos.length" titulo="nenhum serviço reportado" detalhe="o coletor de status não devolveu itens." />
    <BaseGrade v-else minimo="260px" espaco="4">
      <BaseIndicador
        v-for="s in servicos"
        :key="s.nome"
        :nome="s.nome"
        :tom="tomDeServico(s.estado)"
        :detalhe="s.detalhe"
        :como-resolver="s.comoResolver"
        :pulsando="s.estado === 'erro'"
      />
    </BaseGrade>
  </BasePainel>
</template>
