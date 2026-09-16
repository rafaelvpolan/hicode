// motor/observabilidade/projecao.ts
class Projecao {
  atividades = new Map;
  cursor = "";
  degradado = false;
  reconstruir(s) {
    this.atividades.clear();
    for (const a of s.atividades)
      this.atividades.set(a.id, a);
    this.cursor = s.cursor;
    this.degradado = s.degradado;
  }
  aplicar(e) {
    if (e.versao !== 1)
      throw new Error("versao de observabilidade nao suportada");
    const anterior = this.atividades.get(e.atividade.id);
    if (anterior && anterior.revisao >= e.atividade.revisao)
      return;
    const saida = new Map((anterior?.saida ?? []).map((s) => [s.sequencia, s]));
    for (const s of e.atividade.saida)
      saida.set(s.sequencia, s);
    const retida = [...saida.values()].sort((a, b) => a.sequencia - b.sequencia).slice(-64);
    while (retida.reduce((n, s) => n + s.texto.length, 0) > 16384)
      retida.shift();
    this.atividades.set(e.atividade.id, { ...e.atividade, saida: retida });
    this.cursor = e.id;
  }
}

// motor/api/cliente.ts
class ErroMotorHttp extends Error {
  status;
  corpo;
  constructor(status, corpo) {
    super(`HII respondeu HTTP ${status}`);
    this.status = status;
    this.corpo = corpo;
  }
}
function clienteHii(base, token) {
  const url = new URL(base);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error("URL do motor invalida");
  const origem = base.replace(/\/$/, "");
  async function chamar(caminho, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    if (init.body)
      headers.set("content-type", "application/json");
    const r = await fetch(`${origem}${caminho}`, { ...init, headers, redirect: "error" });
    if (!r.ok)
      throw new ErroMotorHttp(r.status, (await r.text()).slice(0, 4096));
    return r;
  }
  async function get(caminho, signal) {
    const r = await chamar(caminho, { signal: signal ?? AbortSignal.timeout(15000) });
    return { valor: await r.json(), etag: r.headers.get("etag") ?? "" };
  }
  async function post(caminho, corpo, chave, etag = "") {
    const r = await chamar(caminho, {
      method: "POST",
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15000),
      headers: { "idempotency-key": chave, ...etag ? { "if-match": etag } : {} }
    });
    return { valor: await r.json(), etag: r.headers.get("etag") ?? "" };
  }
  function idSeguro(id) {
    if (!/^\d{3,12}$/.test(id))
      throw new Error("ID invalido");
    return id;
  }
  function filtroQuery(filtro) {
    return new URLSearchParams(Object.entries(filtro).filter(([, v]) => !!v)).toString();
  }
  const observarSnapshot = (filtro = {}, depois = "", signal) => get(`/v1/observabilidade/snapshot?${filtroQuery(filtro)}&depois=${encodeURIComponent(depois)}`, signal);
  function observar(filtro, receber, falhar = () => {}) {
    const controle = new AbortController;
    const projecao = new Projecao;
    const concluido = (async () => {
      while (!controle.signal.aborted) {
        try {
          const primeiro = (await observarSnapshot(filtro, "", controle.signal)).valor;
          let pagina = primeiro;
          const atividades = [...primeiro.atividades];
          while (pagina.proxima) {
            pagina = (await observarSnapshot(filtro, pagina.proxima, controle.signal)).valor;
            atividades.push(...pagina.atividades);
          }
          projecao.reconstruir({ ...primeiro, atividades });
          receber(projecao);
          const prazo = AbortSignal.timeout(30000);
          const signal = AbortSignal.any([controle.signal, prazo]);
          const r = await chamar(`/v1/observabilidade/eventos?${filtroQuery(filtro)}`, { signal, headers: { "last-event-id": projecao.cursor } });
          if (!r.body)
            throw new Error("stream sem corpo");
          const leitor = r.body.getReader();
          const decoder = new TextDecoder;
          let buffer = "";
          try {
            while (!signal.aborted) {
              const parte = await leitor.read();
              if (parte.done)
                break;
              buffer += decoder.decode(parte.value, { stream: true });
              if (buffer.length > 1048576)
                throw new Error("evento excede limite");
              let fim = buffer.indexOf(`

`);
              while (fim >= 0) {
                const bloco = buffer.slice(0, fim);
                buffer = buffer.slice(fim + 2);
                const linhas = bloco.split(`
`);
                const tipo = linhas.find((l) => l.startsWith("event: "))?.slice(7);
                if (tipo === "reset")
                  throw new Error("snapshot requerido");
                if (tipo === "activity" || tipo === "output") {
                  const dados = linhas.filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join(`
`);
                  projecao.aplicar(JSON.parse(dados));
                  receber(projecao);
                }
                fim = buffer.indexOf(`

`);
              }
            }
          } finally {
            await leitor.cancel().catch(() => {});
            leitor.releaseLock();
          }
        } catch (e) {
          if (!controle.signal.aborted && e.name !== "TimeoutError")
            falhar(e);
        }
        if (!controle.signal.aborted)
          await new Promise((resolve) => {
            const fechar = () => {
              clearTimeout(timer);
              controle.signal.removeEventListener("abort", fechar);
              resolve();
            };
            const timer = setTimeout(fechar, 1000);
            controle.signal.addEventListener("abort", fechar, { once: true });
          });
      }
    })();
    return { dispose: () => controle.abort(), concluido };
  }
  return {
    observarSnapshot,
    observar,
    catalogoObservabilidade: (repo = "", depois = "") => get(`/v1/observabilidade/recursos?repo=${encodeURIComponent(repo)}&depois=${encodeURIComponent(depois)}`),
    historico: (id, offset = 0) => get(`/v1/tarefas/${idSeguro(id)}/historico?offset=${offset}`),
    configuracao: () => get("/v1/configuracao"),
    configurar: (ajuste, chave, etag) => post("/v1/configuracao", ajuste, chave, etag),
    perguntar: (repo, pergunta, chave) => post("/v1/ask", { repo, pergunta }, chave),
    consulta: (id) => get(`/v1/consultas/${encodeURIComponent(id)}`),
    revisarPlano: (id, plano, revisaoEsperada, chave, etag) => post(`/v1/tarefas/${idSeguro(id)}/plano`, { plano, revisaoEsperada }, chave, etag),
    artefatos: (id) => get(`/v1/tarefas/${idSeguro(id)}/artefatos`),
    artefato: (id) => get(`/v1/artefatos/${encodeURIComponent(id)}`),
    perguntas: (id) => get(`/v1/tarefas/${idSeguro(id)}/perguntas`),
    responderPergunta: (id, perguntaId, texto, chave, etag) => post(`/v1/tarefas/${idSeguro(id)}/respostas`, { perguntaId, texto }, chave, etag),
    capacidades: () => get("/v1/capacidades"),
    provedores: () => get("/v1/provedores"),
    estado: (repo = "") => get(`/v1/estado?repo=${encodeURIComponent(repo)}`),
    novaSessao: (repo, titulo, chave) => post("/v1/sessoes", { repo, titulo }, chave),
    sessao: (id) => get(`/v1/sessoes/${idSeguro(id)}`),
    pedido: (id, pedido, chave) => post(`/v1/sessoes/${idSeguro(id)}/pedidos`, pedido, chave),
    tarefa: (id) => get(`/v1/tarefas/${idSeguro(id)}`),
    plano: (id) => get(`/v1/tarefas/${idSeguro(id)}/plano`),
    agir: (id, acao, texto, chave, etag) => post(`/v1/tarefas/${idSeguro(id)}/acoes`, { acao, ...texto ? { texto } : {} }, chave, etag),
    fechar: (id, chave, etag) => post(`/v1/sessoes/${idSeguro(id)}/fechar`, {}, chave, etag),
    log: (id, offset = 0) => get(`/v1/tarefas/${idSeguro(id)}/log?offset=${offset}`),
    recursos: (repo) => get(`/v1/recursos?repo=${encodeURIComponent(repo)}`),
    eventos: (cursor = "", signal) => chamar("/v1/eventos", { signal, headers: { accept: "text/event-stream", ...cursor ? { "last-event-id": cursor } : {} } })
  };
}
export {
  ErroMotorHttp,
  clienteHii
};
