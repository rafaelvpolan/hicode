<script setup lang="ts">
import { useCardActions } from '../composables/useCardActions'
import { useDashboard } from '../composables/useDashboard'

const { repos, gh, sprintRepo, load } = useDashboard()
const { newRepo, repoMsg, projectPreview, addRepo, loadGh, quickAdd, runProjectPreview } = useCardActions({ load, gh, sprintRepo })
</script>

<template>
  <BasePilha espaco="6">
    <BasePainel>
      <BaseCabecalhoSecao rotulo="alvo" titulo="Repositórios geridos" descricao="o hicode é o plano de controle; o trabalho acontece nestes repos">
        <template #acoes>
          <BaseBotao variante="solido" @click="runProjectPreview">▶ preview do projeto</BaseBotao>
          <BaseBotao @click="load">↻ atualizar</BaseBotao>
        </template>
      </BaseCabecalhoSecao>

      <RepoPanel
        :repos="repos"
        :gh="gh"
        :new-repo="newRepo"
        :repo-msg="repoMsg"
        :project-preview="projectPreview"
        @add-repo="addRepo"
        @load-gh="loadGh"
        @quick-add="quickAdd"
      />
    </BasePainel>
  </BasePilha>
</template>
