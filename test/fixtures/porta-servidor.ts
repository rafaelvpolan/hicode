interface ServidorEscutando {
  readonly port: number | undefined
}

export function portaDe(servidor: ServidorEscutando): number {
  const porta = servidor.port
  if (porta === undefined) throw new Error('servidor de teste subiu sem porta TCP')
  return porta
}
