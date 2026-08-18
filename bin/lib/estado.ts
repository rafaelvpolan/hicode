import type { ModoNavegacao } from '../../lib/core/tui/input'

let itemSelecionado = ''
let modo: ModoNavegacao = ''

export function selecionado(): string {
  return itemSelecionado
}

export function selecionar(id: string): void {
  itemSelecionado = id
}

export function modoAtual(): ModoNavegacao {
  return modo
}

export function definirModo(novo: ModoNavegacao): void {
  modo = novo
}
