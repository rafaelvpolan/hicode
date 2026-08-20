<script setup lang="ts">
import { useCardActions } from '../composables/useCardActions'
import { useCardReject } from '../composables/useCardReject'
import { useDashboard } from '../composables/useDashboard'
import { useFilaDeCards } from '../composables/useFilaDeCards'
import { useSobreposicoes } from '../composables/useSobreposicoes'

const { cards, repos, runs, estimates, gh, sprintRepo, load } = useDashboard()
const {
  sprintText, sprintMsg, stagedLinks, stagedFiles, editing,
  createSprint, addStagedLink, removeStagedLink, addStagedFiles, removeStagedFile,
  start, pause, resume, act, replay, answerClarify, resetPreview, removeCard, openEdit, saveEdit, closeEdit,
} = useCardActions({ load, gh, sprintRepo })
const { rejecting, openReject, closeReject, confirmReject } = useCardReject({ load })
const { cardsOrdenados, kpis } = useFilaDeCards(cards, runs)
const {
  cardEmReview, cardEmPreview, cardDoPreview,
  abrirReview, fecharReview, abrirPreview, fecharPreview,
} = useSobreposicoes(cards)
</script>

<template>
  <BasePilha espaco="6">
    <KpiBar :kpis="kpis" />

    <BasePainel>
      <BaseCabecalhoSecao rotulo="nova sprint" titulo="Descreva a feature" descricao="cada linha vira um card; links e imagens de referência entram como anexo" />
      <SprintPanel
        :repos="repos"
        :sprint-repo="sprintRepo"
        :sprint-text="sprintText"
        :sprint-msg="sprintMsg"
        :staged-links="stagedLinks"
        :staged-files="stagedFiles"
        @update:sprint-repo="sprintRepo = $event"
        @update:sprint-text="sprintText = $event"
        @create-sprint="createSprint"
        @add-staged-link="addStagedLink"
        @remove-staged-link="removeStagedLink"
        @add-staged-files="addStagedFiles"
        @remove-staged-file="removeStagedFile"
      />
    </BasePainel>

    <BasePainel>
      <BaseCabecalhoSecao rotulo="fila de execução" titulo="Cards em voo" :descricao="`${cardsOrdenados.length} card(s)`">
        <template #acoes>
          <BaseBotao @click="load">↻ atualizar</BaseBotao>
        </template>
      </BaseCabecalhoSecao>

      <BaseVazio
        v-if="!cardsOrdenados.length"
        titulo="nenhum card"
        detalhe="crie features na sprint acima — o motor descobre trabalho e escreve os cards."
      />

      <BasePilha v-else espaco="4">
        <CardRow
          v-for="c in cardsOrdenados"
          :key="c.id"
          :card="c"
          :runs="runs"
          :estimates="estimates"
          @start="start"
          @pause="pause"
          @resume="resume"
          @resolve="(id) => act(id, 'resolve')"
          @approve="(id) => act(id, 'approve')"
          @reject="openReject"
          @edit="openEdit"
          @remove="removeCard"
          @replay="(step) => replay(c.id, step)"
          @review="abrirReview"
          @preview="abrirPreview"
          @reset="(id) => resetPreview(id, false)"
          @clarify="answerClarify"
        />
      </BasePilha>
    </BasePainel>
  </BasePilha>

  <CardEditModal :editing="editing" @save="saveEdit" @close="closeEdit" />
  <CardRejectModal :rejecting="rejecting" @confirm="confirmReject" @close="closeReject" />

  <ClientOnly>
    <CardReview v-if="cardEmReview" :card-id="cardEmReview" @close="fecharReview" @preview="abrirPreview" />
    <CardPreview
      v-if="cardEmPreview"
      :card-id="cardEmPreview"
      :shot="cardDoPreview?.shot ?? false"
      :preview-url="cardDoPreview?.preview_url ?? ''"
      @close="fecharPreview"
      @reset="(hard) => resetPreview(cardEmPreview, hard)"
    />
  </ClientOnly>
</template>
