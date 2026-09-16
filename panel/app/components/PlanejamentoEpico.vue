<script setup lang="ts">
import type { EpicoDeProduto, TarefaDeProduto } from '#shared/planejamento'
const props = defineProps<{ epico: EpicoDeProduto; bloqueado: boolean }>()
const campos = { problema: 'Problema', objetivo: 'Objetivo', publico: 'Publico', resultado: 'Resultado esperado',
  metrica: 'Metrica de sucesso', escopo: 'Escopo', exclusoes: 'Fora de escopo', hipoteses: 'Hipoteses', perguntas: 'Perguntas abertas' } as const
function adicionar(): void {
  props.epico.tarefas.push({ id: crypto.randomUUID(), titulo: '', resultado: '', criterios: [''], prioridade: 'media', justificativa: '', dependeDe: [] })
}
function linhas(t: TarefaDeProduto, event: Event): void { t.criterios = (event.target as HTMLTextAreaElement).value.split('\n') }
function mover(indice: number, delta: number): void {
  const destino = indice + delta
  if (destino < 0 || destino >= props.epico.tarefas.length) return
  const [t] = props.epico.tarefas.splice(indice, 1)
  if (t) props.epico.tarefas.splice(destino, 0, t)
}
</script>
<template>
  <section>
    <h2>Epico e resultados de produto</h2>
    <p>Revise a decomposicao antes de salvar. Nenhuma tarefa e enviada ao motor por esta tela.</p>
    <fieldset :disabled="bloqueado">
      <div class="grade"><label v-for="(rotulo, campo) in campos" :key="campo">{{ rotulo }}<textarea v-model="epico[campo]" rows="2" /></label></div>
      <article v-for="(t, i) in epico.tarefas" :key="t.id" :id="'tarefa-' + t.id">
        <h3>Tarefa {{ i + 1 }} <small>{{ t.id }}</small></h3>
        <label>Titulo<input v-model="t.titulo"></label>
        <label>Resultado observavel<textarea v-model="t.resultado" rows="2" /></label>
        <label>Criterios de aceite — um por linha, com cenario e resultado<textarea :value="t.criterios.join('\n')" rows="3" @input="linhas(t, $event)" /></label>
        <div class="grade">
          <label>Prioridade<select v-model="t.prioridade"><option value="alta">Alta</option><option value="media">Media</option><option value="baixa">Baixa</option></select></label>
          <label>Justificativa<textarea v-model="t.justificativa" rows="2" /></label>
          <label>Depende de<select v-model="t.dependeDe" multiple><option v-for="outra in epico.tarefas.filter(o => o.id !== t.id)" :key="outra.id" :value="outra.id">{{ outra.titulo || outra.id }}</option></select></label>
          <label>ID de tarefa existente no HII (opcional)<input v-model="t.cardExistente" placeholder="001"></label>
        </div>
        <div class="acoes"><button type="button" :disabled="i === 0" @click="mover(i, -1)">Mover para cima</button><button type="button" :disabled="i === epico.tarefas.length - 1" @click="mover(i, 1)">Mover para baixo</button><button type="button" @click="epico.tarefas.splice(i, 1)">Remover da proposta</button></div>
      </article>
      <button type="button" @click="adicionar">Adicionar tarefa de produto</button>
    </fieldset>
  </section>
</template>
<style scoped>
fieldset{border:0;padding:0}.grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}label{display:flex;flex-direction:column;gap:8px;margin:12px 0;font-size:14px}input,textarea,select,button{font:inherit;padding:10px;background:transparent;color:inherit;border:1px solid #65716a;border-radius:5px}option{color:#111}article{border-top:1px solid #65716a;margin-top:24px;padding-top:16px}small{display:block;font:11px monospace;overflow-wrap:anywhere;opacity:.6}.acoes{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid #76d8ad;outline-offset:3px}@media(max-width:600px){.grade{grid-template-columns:1fr}}
</style>
