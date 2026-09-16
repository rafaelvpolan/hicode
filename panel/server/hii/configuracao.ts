import type { CapacidadesHii, ConfiguracaoDoPainel, ConfiguracaoHii, ProvedorHii } from '../../shared/configuracao-hii'
export interface ClienteDeConfiguracao {
  capacidades(): Promise<{ valor: CapacidadesHii }>
  provedores(): Promise<{ valor: { provedores: ProvedorHii[] } }>
  configuracao(): Promise<{ valor: ConfiguracaoHii; etag: string }>
}
export async function consultarConfiguracao(cliente: ClienteDeConfiguracao): Promise<ConfiguracaoDoPainel> {
  const c = (await cliente.capacidades()).valor.configuracao
  if (!c?.versoes.includes(1) || !c.leitura) return {
    disponivel: false, escrita: false, motivo: 'Este motor ou esta credencial nao oferece configuracao v1. O acompanhamento continua disponivel.',
    etag: '', configuracao: null, provedores: [],
  }
  const [config, provedores] = await Promise.all([cliente.configuracao(), cliente.provedores()])
  return { disponivel: true, escrita: c.escrita, motivo: c.escrita ? '' : 'Credencial sem permissao administrativa de escrita',
    etag: config.etag, configuracao: config.valor, provedores: provedores.valor.provedores }
}
