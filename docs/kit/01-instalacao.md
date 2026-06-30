# 01 — Instalação (≈5 min)

O kit tem quatro peças que vivem em lugares diferentes da sua máquina:

| Peça | Vai para | Efeito |
|------|----------|--------|
| Agentes (`agents/*.md`) | `~/.claude/agents/` | Disponibiliza os 15 subagentes |
| Skill Nexus (`skills/nexus/`) | `~/.claude/skills/nexus/` | Habilita o comando `/nexus` |
| Bloco de roteamento (`claude-md/global-CLAUDE.md.snippet`) | `~/.claude/CLAUDE.md` | Faz o Claude delegar automaticamente |
| Hook de comentários (`hooks/block-comments.mjs`) | `~/.claude/hooks/` + `settings.json` | Bloqueia comentário de prosa em código (Clean Code) |

> `~` é a sua home. No macOS/Linux normalmente `/home/<você>` ou `/Users/<você>`.

## Passo 1 — Copiar os agentes

```bash
mkdir -p ~/.claude/agents
cp agents/*.md ~/.claude/agents/
```

Cada arquivo é um agente. O nome do arquivo (`limpio.md`) define o `subagent_type`
(`limpio`) usado pelo roteamento e pelo Nexus — **não renomeie sem atualizar o
bloco de `CLAUDE.md` e o `SKILL.md` do Nexus**.

## Passo 2 — Copiar a skill Nexus

```bash
mkdir -p ~/.claude/skills
cp -r skills/nexus ~/.claude/skills/
```

Isso cria `~/.claude/skills/nexus/SKILL.md`, que registra o comando `/nexus`.

## Passo 3 — Colar o bloco de roteamento no CLAUDE.md global

Abra (ou crie) `~/.claude/CLAUDE.md` e cole o conteúdo de
`claude-md/global-CLAUDE.md.snippet`. Esse bloco é **o que muda o comportamento
default**: sem ele, os agentes existem mas o Claude tende a fazer tudo sozinho no
loop principal; com ele, o Claude passa a rotear trabalho de domínio para o agente
certo mesmo quando você não digita `/nexus`.

Se você já tem um `~/.claude/CLAUDE.md`, mescle: mantenha suas seções e adicione as
seções **Roteamento de agentes** e **Regras**.

## Passo 4 — Instalar o hook de comentários

O snippet do passo 3 pede "sem comentário de prosa em código". Para tornar isso
**determinístico** (e não só uma instrução que o modelo pode esquecer ao longo de uma
sessão longa), instale o hook:

```bash
mkdir -p ~/.claude/hooks
cp hooks/block-comments.mjs ~/.claude/hooks/
```

Depois registre-o em `~/.claude/settings.json`, no array `hooks.PreToolUse`. O snippet de
registro pronto e os detalhes (o que bloqueia, o que é permitido, escopo) estão em
[`../hooks/README.md`](../hooks/README.md). A política completa, com exemplos e a filosofia,
está em [`09-boas-praticas-de-comentarios.md`](09-boas-praticas-de-comentarios.md).

## Passo 5 — (Opcional) CLAUDE.md por projeto

Para cada repositório, copie `claude-md/project-CLAUDE.md.template` para um
`CLAUDE.md` na raiz e preencha stack, comandos e convenções. O global cuida do
roteamento; o do projeto cuida do que é específico daquele código.

## Verificar a instalação

1. **Agentes presentes:**
   ```bash
   ls ~/.claude/agents/
   # deve listar: celer continuum corvinus crivo escudo fulgor glossia
   #              limpio pluto pura quaero radix rufus testudo vitro (.md)
   ```
2. **Nexus registrado:** abra o Claude Code no terminal e digite `/` — `/nexus`
   deve aparecer na lista de comandos. Ou rode `/nexus testar pipeline` e veja se
   ele entra no protocolo de análise.
3. **Roteamento ativo:** peça algo de domínio claro sem citar o agente, ex.:
   *"revise a segurança do fluxo de login"* — o Claude deve anunciar que vai
   delegar ao **escudo** em vez de revisar ele mesmo.
4. **Hook de comentários ativo** (deve imprimir `exit=2`):
   ```bash
   echo '{"tool_name":"Write","tool_input":{"file_path":"x.ts","content":"// oi\nconst a=1\n"}}' \
     | node ~/.claude/hooks/block-comments.mjs; echo "exit=$?"
   ```

## Atualizando o kit

Quando o Douglas (dono dos agentes) publicar uma versão nova, basta repetir os
passos 1 e 2 (sobrescrevem) e re-mesclar o passo 3 se o bloco mudou. Os agentes
guardam memória institucional por máquina em `~/.claude/agent-memory/<agente>/` —
isso é local de cada um e **não** vem no kit.

## Desinstalar

Remova os arquivos copiados (`~/.claude/agents/<nome>.md`,
`~/.claude/skills/nexus/`) e o bloco de roteamento do `~/.claude/CLAUDE.md`.

---

Próximo: [`02-catalogo-de-agentes.md`](02-catalogo-de-agentes.md) — quem é quem no time.
