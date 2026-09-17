import type { RevisaoDePlanejamento, TarefaDeProduto } from '../../shared/planejamento'
import type { RevisaoTecnica, ReferenciaDeDependencia } from '../../shared/tecnico'
import type { AvaliacaoDeExecucao } from '../../shared/avaliacao-hii'
import { progressoDaTarefa } from './progresso-produto'
import { ErroTecnicoStore } from './tecnico-store'
export async function dependenciasParaEnvio(p: RevisaoDePlanejamento, tarefa: TarefaDeProduto,
  ler: (produto: string) => RevisaoTecnica | null,
  avaliar: (id: string) => Promise<AvaliacaoDeExecucao>): Promise<ReferenciaDeDependencia[]> {
  if (tarefa.dependeDe.length > 8) throw new ErroTecnicoStore(409, 'Divida a tarefa: no maximo oito dependencias diretas por despacho')
  const snapshots: { produto: string; hash: string; revisao: number }[] = []
  const refs = await Promise.all(tarefa.dependeDe.map(async produto => {
    const t = p.documento.epico?.tarefas.find(t => t.id === produto)
    const tecnico = ler(produto)
    if (!t || !tecnico?.aprovada || !tecnico.envio?.execucao) throw new ErroTecnicoStore(409, 'Dependencia sem revisao aprovada e execucao: ' + produto)
    const progresso = await progressoDaTarefa(p, t, tecnico, avaliar)
    const atual = ler(produto)
    if (atual?.hash !== tecnico.hash || atual.revisao !== tecnico.revisao || progresso.estado !== 'concluida' || !progresso.avaliacao?.entrega?.merge) {
      throw new ErroTecnicoStore(409, 'Dependencia sem entrega comprovada da revisao atual: ' + produto)
    }
    snapshots.push({ produto, hash: tecnico.hash, revisao: tecnico.revisao })
    return { produto, execucao: tecnico.envio.execucao, tecnicoHash: progresso.avaliacao.plano!.tecnicoHash }
  }))
  for (const s of snapshots) {
    const atual = ler(s.produto)
    if (atual?.hash !== s.hash || atual.revisao !== s.revisao) throw new ErroTecnicoStore(409, 'Dependencia mudou durante a preparacao: ' + s.produto)
  }
  return refs
}
