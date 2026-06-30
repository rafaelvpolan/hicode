A metodologia aplicada de orquestração de subagentes no **Claude Code** é um blueprint técnico projetado para superar as limitações das janelas de contexto finitas, tratando-as como um orçamento de atenção. Em vez de inundar o agente principal com ruídos como logs, buscas extensas ou dumps de arquivos, a estratégia consiste em delegar esse processamento para instâncias isoladas, que retornam apenas uma síntese estruturada.

### Pilares da Metodologia:

* **Isolamento e Delegação (Regra de Ouro):** A regra central define que, se a saída da tarefa é um ruído descartável que não exigirá referência futura, ela deve ser isolada em um subagente. Isso blinda o agente principal, permitindo que ele mantenha a coerência arquitetural e o raciocínio estratégico sem a poluição informacional.

* **Governança pelo Privilégio Mínimo (POSIX):** A segurança operacional é garantida pela aplicação rigorosa de permissões. Utilizando listas de permissão (*tools*) e bloqueio (*disallowedTools*), a metodologia assegura que cada agente possua apenas o escopo de ferramentas necessário para sua função, evitando que, por exemplo, um agente de pesquisa ganhe inadvertidamente poder de escrita ou acesso ao bash.

* **Tiering de Modelos (Otimização de Custos e Raciocínio):** A alocação inteligente de modelos define a eficiência do sistema: modelos de alta capacidade (como *Opus*) são reservados para decisões críticas e auditoria, enquanto modelos de alta velocidade (*Haiku*) são utilizados para buscas em massa, garantindo que o fan-out de tarefas não gere desperdício computacional.

* **Topologia de Escala:** A arquitetura adota uma topologia plana limitada a um único nível de profundidade para evitar latência e falhas na orquestração. Fluxos mais complexos que exigem aninhamento devem ser resolvidos via *Skills* ou achatar a estrutura, disparando subagentes em paralelo a partir do orquestrador central.

* **Segurança e Isolamento de Escrita:** Para evitar o *merge hell* em refatorações, utiliza-se o isolamento por *git worktree*. Cada subagente trabalha em um ambiente sandboxed; a orquestração monitora essas tentativas paralelas e realiza o merge apenas da solução validada, mantendo o repositório principal íntegro.

* **O Padrão Executor-Avaliador:** Para garantir auditorias sem viés de confirmação, a metodologia separa o agente que escreve o código (Executor) daquele que revisa (Avaliador). A barreira de sanitização impede que o histórico de raciocínio do autor influencie o avaliador, que recebe apenas o *diff* puro, permitindo uma análise verdadeiramente adversarial.

* **O Paradoxo da Fidelidade e o Ciclo Híbrido:** O vídeo alerta que subagentes podem sacrificar nuances transversais ao criar resumos. Portanto, a metodologia propõe um ciclo híbrido: a pesquisa exploratória e o mapeamento são delegados para velocidade, mas a leitura profunda e a refatoração final de elementos que afetam múltiplos pontos da base de código devem ser executadas com a atenção direta do agente principal.

**Conclusão:** O gargalo final não é o poder da IA, mas a capacidade cognitiva humana de orquestrar múltiplos fluxos. A metodologia ensina que automatizar a execução é essencial, mas a compreensão espacial e a visão sistêmica do projeto devem permanecer sob controle da atenção humana.

# TEXTO COMPLETO:

Claude Code: Orquestração e Governança de Subagentes


Sub-agentes são o mecanismo de delegação do Cloud Code. A arquitetura é simples de enxergar, mas poderosa. Existe um agente principal, o main agent, que orquestra o trabalho.
E existem sub-agentes, instâncias separadas que executam tarefas pontuais. O main agent envia uma tarefa, cada sub-agente trabalha de forma isolada em sua própria janela de contexto e devolve apenas uma síntese limpa, nunca o trabalho bruto. Repare no fluxo.
A tarefa flui para fora, em direção aos sub-agentes. O resumo limpo flui de volta, para dentro do agente principal. Essa assimetria é o ponto central.
A delegação isola a carga de trabalho. O main agent mantém o contexto limpo, enquanto os sub-agentes absorvem o ruído. Ao longo desta apresentação, vamos transformar essa intuição em um conjunto de regras de arquitetura, isolamento, segurança e escala que você pode aplicar diretamente.
Antes da solução, o problema. A janela de contexto é finita e isso muda tudo. Pense no contexto não como um repositório de tokens, mas como um orçamento de atenção.
No topo da tela, um contexto limpo. Dois grandes blocos de raciocínio estratégico e arquitetura ocupam o espaço de forma legível, organizada. É assim que o agente raciocina bem.
Logo abaixo, o contexto inundado. Dezenas de fragmentos de ruído, logs, resultados de grep, file dumps, stack traces, blobs de JSON, saídas de console, error logs, invadem a janela e empurram o raciocínio estruturado para fora, literalmente cortando-o na borda. Esse é o mecanismo da degradação.
Quando você manda o agente principal ler arquivos inteiros ou varrer logs diretamente no thread principal, o custo real não é o número de tokens consumidos, é a atenção perdida. A lógica estrutural, a visão de alto nível do sistema é expulsa da memória ativa. O subagente existe precisamente para impedir que isso aconteça.
Ele recebe o ruído e devolve só o sinal. Vejamos a anatomia de um subagente. A regra que define tudo é esta.
Entra uma tarefa, sai uma síntese e o caminho percorrido fica de fora. Um subagente é uma instância separada do Cloud e essa separação tem quatro dimensões. Ele tem o seu próprio contexto, uma janela limpa, independente da principal, tem o seu próprio conjunto de ferramentas, que você define, tem o seu próprio modelo, que pode ser diferente do modelo da sessão principal, e tem as suas próprias permissões.
Tudo isso vive dentro de um sandbox isolado. Você entrega um prompt de tarefa de um lado. Lá dentro, o subagente faz o trabalho, que pode ser caótico, iterativo, cheio de buscas erradas e becos sem saída, aquele emaranhado cinza no centro do diagrama.
E do outro lado, sai apenas a síntese. O agente principal nunca vê os passos intermediários. É exatamente essa cegueira deliberada que blinda o contexto global contra a poluição de logs e de buscas que não deram em nada.
O isolamento não é um efeito colateral, é o design. Com a anatomia clara, vem a regra de ouro da delegação, o critério prático para decidir quando criar um subagente. A heurística cabe numa linha de pseudocódigo.
Se a saída é ruído descartável, gere um subagente. Em termos concretos, sempre que uma tarefa lateral produzir buscas extensas, dumps de arquivo, ou logs que você não vai referenciar novamente no futuro, ela não pertence ao thread principal. O padrão tem três estágios.
No primeiro, o material ruidoso. Search, dumps, logs. No segundo, o subagente isola e processa esse material longe da atenção principal.
No terceiro, apenas um clean summary, um resumo limpo, retorna ao main thread. O princípio é direto. Delegue tudo o que inundaria o contexto e não terá valor de referência depois.
O subagente faz o trabalho sujo isoladamente. E o agente principal recebe só o que importa para raciocinar. Antes de você sair criando subagentes customizados, é importante saber que o Cloud Code já traz subagentes nativos, auto-invocados pela descrição da tarefa.
São três que você precisa conhecer. O primeiro é o Explore. Roda em Haiku, somente leitura, e serve para a varredura de Codebase.
Busca rápida e barata de onde as coisas estão. O segundo é o Plan. Ele herda o modelo da conversa principal, também somente leitura, e atua durante o modo de planejamento, pesquisando o código antes de propor um plano.
O terceiro é o General. Herda o modelo principal, tem acesso a todas as ferramentas, e cobre tarefas multi-etapa que exigem tanto exploração quanto modificação. Note bem este ponto, porque é uma fonte comum de confusão.
O General nativo herda o modelo da conversa. Ele não usa um modelo custom. Modelo custom é coisa de subagente que você define.
A lição prática, não reinvente a roda. O Cloud Code já delega essas instâncias nativas para leitura e planejamento antes de exigir qualquer execução customizada da sua parte. Agora, governança de ferramentas.
E aqui o modelo mental certo é o das permissões POSIX. Cada subagente recebe um escopo de ferramentas, e esse escopo deve seguir o princípio do privilégio mínimo. Conceda o mínimo necessário para a função, e nada além disso.
Olha a matriz. Um leitor ou revisor recebe apenas read e grab, leitura e busca. Nada de webfetch, nada de bash ou edit.
Um pesquisador adiciona webfetch e websearch, porque precisa investigar fora do código, mas continua sem poder de escrita. Só o escritor recebe o conjunto completo, incluindo bash e edit. A célula destacada em vermelho, leitor com bash ou edit, é o erro a evitar a todo custo.
Um revisor com acesso a bash pode executar comandos. Um pesquisador com edit pode reescrever o seu código. Em termos de configuração, você controla isso com dois campos no frontmatter.
Tools, que é uma allow list, e disallowed tools, que é uma demilist. Em fluxos autônomos, onde ninguém está olhando cada passo, o escopo restrito é a sua única garantia real de segurança. Um pesquisador jamais deveria ter o poder de reescrever a sua base de código.
O segundo eixo de governança é o modelo, o que chamamos de tiering, ou seja, escolher o nível de inteligência certo para cada tarefa. A linha atual, em 2026, é esta. No topo da pirâmide, Opus 4.8, raciocínio profundo, decisões de arquitetura, auditoria de segurança.
No meio, Sonnet 4.6, codificação do dia a dia e execução. Na base, Haiku 4.5, busca, classificação e lookups rápidos de dependência. E a parte, para casos de fronteira, há o tier Fable 5, da classe Mythos.
Atenção a um detalhe que costuma aparecer desatualizado em material mais antigo. Não é mais Cloud 3. A geração vigente é a 4.x mais o Fable. O princípio do tiering, porém, é atemporal.
Direcionar o modelo exato à complexidade da tarefa reduz o custo computacional e viabiliza fan-out massivo sem desperdício. Na prática, você pode forçar o modelo de todos os subagentes de uma sessão exportando a variável de ambiente Cloud Code Subagent Model igual a Haiku. Para uma carga de trabalho que é só busca repetitiva, isso corta o custo de forma muito perceptível.
Há um limite estrutural na arquitetura de subagentes que você precisa internalizar. A topologia é plana, com profundidade máxima de um nível. Subagentes não podem invocar outros subagentes.
Veja os dois lados. À esquerda, o antepadrão. O main chama um sub que tenta chamar um subsub.
Isso simplesmente falha. É um limite rígido, não uma recomendação. À direita, a prática correta.
O main agent dispara diretamente o sub1, o sub2 e o sub3, em paralelo, centralizando a orquestração. A regra mental é maxDepth igual a 1. Se uma tarefa parece exigir aninhamento, um subagente que precisaria de seus próprios subagentes, a solução é achatar. Faça o main agent disparar o segundo nível assim que o primeiro retornar.
E quando o fluxo for genuinamente aninhado por natureza, existe a saída certa. Use skills. Uma skill roda dentro do contexto principal, então ela pode chamar o mecanismo de agentes quantas vezes quiser, em qualquer padrão, porque não está sujeita ao limite de um nível.
Quando subagentes precisam escrever, modificar arquivos de verdade, surge um risco óbvio. Colisão. Vários agentes editando a mesma base ao mesmo tempo se sobrescrevem.
A solução é o isolamento por WorkTree, declarado no FrontMatter como Isolation WorkTree. O que acontece é elegante. O Cloud Code cria um Git WorkTree temporário para cada subagente.
Cada um trabalha no seu próprio ambiente, partindo do main branch, sem tocar no que os outros fazem. No diagrama, três tentativas paralelas da mesma feature divergem do branch principal. Duas delas não vingam e são descartadas automaticamente.
O AutoClean remove o WorkTree quando o subagente termina sem mudanças aproveitáveis. Apenas a melhor tentativa é mesclada de volta ao main branch. O ciclo é branch, sandbox, merge.
Você dispara caminhos paralelos isolados. A orquestração funde a melhor solução e descarta as falhas, tudo sem nunca sujar o repositório principal. É a forma mais limpa de fazer fan-out de tentativas de escrita.
Para mudanças sensíveis, existe um padrão de segurança específico. O executor-avaliador, que produz uma auditoria de viés zero. A ideia é separar quem escreve de quem avalia, mas o detalhe que faz o padrão funcionar é o que se passa no meio.
À esquerda, o subagente-executor, tipicamente em SONET, implementa a mudança e gera o DIF de código. Esse DIF precisa chegar ao avaliador, mas atravessando uma barreira de sanitização. O que a barreira bloqueia é crucial.
Todo o raciocínio do autor, toda a cadeia de pensamento, todo o histórico de tentativas anteriores, nada disso passa. Só o DIF cru atravessa. Por quê? Porque se você entrega ao revisor a cadeia de raciocínio de quem escreveu, ele tende a concordar, herda o viés de confirmação do autor.
Entregando apenas o DIF, o avaliador, de preferência um opus fresco, sem contexto prévio, examina a mudança com olhos verdadeiramente adversariais. É assim que você pega o que um único agente teria deixado passar. Use esse padrão, sobretudo em código de autenticação, de pagamentos, em qualquer fluxo que toque entrada de usuário.
Agora, a pergunta da escala. Quantas sessões paralelas valem a pena? E a resposta surpreende, porque o gargalo é biológico, não computacional. Olha a curva.
O throughput sustentável sobe à medida que você adiciona as sessões paralelas, mas só até cerca de 4. Esse pico, em torno de 4, é a capacidade cognitiva humana. Depois dele, a eficiência despenca e você entra na zona que chamamos de merge hell. A máquina, tecnicamente, sustenta por volta de 10 agentes concorrentes por padrão, mas o desenvolvedor consegue manter no máximo 4 modelos mentais de o que este branch está fazendo ao mesmo tempo.
Acima disso, o limitador deixa de ser a API e passa a ser o cérebro humano tentando revisar GIFs em paralelo. Mais sessões não significam mais entrega, significam caos de merge. Há uma única exceção legítima, fluxos best-of-n descartáveis, em que você dispara várias tentativas efêmeras apenas para escolher uma e descartar o resto, sem manutenção ativa de branches.
E uma nota de atualidade. O modo Ultra Code, a partir da versão 2.1.160, eleva bastante esse teto técnico, até 16 concorrentes e cerca de 1.000 agentes por execução. Mas o gargalo humano permanece o mesmo.
Há um limite mais sutil na delegação, que chamamos de paradoxo da fidelidade. Subagentes são ótimos para condensar grandes volumes em resumos limpos. Esse é o ponto forte deles.
Mas observe o que acontece com a informação. À esquerda, a arquitetura real de um sistema. Um grafo denso, com muitos nós e muitas dependências cruzadas, transversais.
Esse grafo passa pelo resumo do subagente Explore. E à direita, sai um grafo esparso. Poucos nós, poucas conexões.
É a perda de resolução. O resumo extrai a estrutura macro, mas sacrifica a nuance transversal, as dependências implícitas que atravessam vários arquivos. Para a maioria das tarefas, isso é aceitável.
Mas em refatorações cross-cutting profundas, aquelas que tocam a mesma lógica espalhada por muitos arquivos, um resumo simplesmente falha em capturar o que importa. A regra que se extrai daqui é clara. A pesquisa pode ser delegada, mas a leitura precisa ser direta.
Quando a nuance transversal está em jogo, o agente principal tem que ler o conteúdo real, não o resumo dele. Como conciliar velocidade e fidelidade? Com o ciclo híbrido de refatoração segura, em quatro passos. Passo 1. Explorar.
Um subagente em raico faz a varredura rápida com grep e mapeia todos os call sites. É a fase de velocidade, e ela acontece isolada. Passo 2. Sintetizar.
O main agent recebe esse mapa estrutural, esse índice de onde tudo vive. Passo 3. Auditar. E aqui está a virada.
O agente principal lê o conteúdo real de cada arquivo listado, recuperando a alta fidelidade e a nuance que o resumo havia perdido. Passo 4. Executar. Com o contexto completo na atenção principal, ele aplica a refatoração com precisão cirúrgica.
A síntese é esta. A pesquisa do subagente economiza tempo mapeando os call sites. A leitura direta do agente principal protege a arquitetura.
Os dois são inegociáveis. Nenhum sozinho é suficiente. O isolamento salva tempo de pesquisa.
Os subagentes, que operam dentro de uma única sessão, para isolamento pontual. Em volta dela, uma camada de orquestração entre sessões. Os background agents, que você dispara com o cloud-bg e monitora num painel próprio.
E os agent teams, sessões que se comunicam entre si. E há ainda a camada de memória persistente, em .cloud barra agent-memory, onde um subagente acumula padrões e aprendizados do seu codebase ao longo de várias conversas. A distinção essencial é simples.
Subagente é dentro da sessão. Background e teams são entre sessões. A conclusão prática.
Subagentes resolvem o isolamento pontual de uma tarefa. Mas o paralelismo absoluto e sistêmico, várias frentes de trabalho coordenadas, exige orquestração assíncrona nessas camadas externas. Chegamos ao axioma que resume toda esta arquitetura.
Não delegue a sua compreensão espacial. No centro está o orquestrador e em torno dele os quatro pilares que percorremos. Governança, permissões mínimas, no modelo POSIX, blindando o repositório contra edições acidentais.
Segurança, o filtro de DIF e o avaliador de olhos frescos, em Opus. Escalabilidade, o reconhecimento de que a barreira não é o limite de tokens, e sim o gargalo cognitivo humano. E isolamento, os work trees e a velocidade do Haiku gerenciando concorrência sem atrito.
O princípio que amarra tudo é este. Subagentes escalam a velocidade da pesquisa e garantem a execução mecânica isolada. Mas a orquestração estrutural e a coesão transversal de um sistema sempre pertencerão à camada principal de atenção.
Escale a execução, paralelize a pesquisa, isole o ruído. Mas a compreensão do todo continua sendo sua. Estado salvo.