# Hooks do kit

Hooks `PreToolUse` que impõem regras de forma **determinística** — independente do que o
modelo decide, o hook age no nível do tool call (vale inclusive para subagentes).

## `block-comments.mjs` — bloqueia comentário de prosa em código

Impede que qualquer `Write`/`Edit`/`MultiEdit` introduza comentário ou docstring que
**explique lógica** em código de aplicação. É a rede determinística da política descrita
em [`../docs/09-boas-praticas-de-comentarios.md`](../docs/09-boas-praticas-de-comentarios.md).

**O que bloqueia:** comentário de linha/bloco e docstring de prosa, JSDoc narrativo,
banner de seção, comentário óbvio — em JS/TS, Java, Go, C-family, Python, Ruby etc.

**O que deixa passar:** cabeçalho de licença; diretivas de tooling (`eslint-disable`,
`@ts-expect-error`, `type: ignore`, `noqa`, `pragma`…); marcadores acionáveis
(`TODO`/`FIXME`/`HACK`/`XXX`/`WIP`); referência de ticket (`PROJ-123`); shebang; e — como
último recurso — comentário que contenha a palavra `code-smell`.

**Fora de escopo (não bloqueia):** IaC/config — `.tf`, `.tfvars`, `.yaml`, `.yml`,
`.toml`, `.sh`/shell. Lá comentário é legítimo.

O detector é um tokenizer char-a-char (não regex ingênuo): URL em string, campo privado
`#` de JS e `//` de divisão inteira do Python **não** geram falso-positivo. Em erro
interno o hook falha **aberto** (exit 0) — nunca trava seu fluxo por bug próprio.

### Instalação

1. Copie o hook:

   ```bash
   mkdir -p ~/.claude/hooks
   cp hooks/block-comments.mjs ~/.claude/hooks/
   ```

2. Registre em `~/.claude/settings.json`, no array `hooks.PreToolUse`:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Write|Edit|MultiEdit",
           "hooks": [
             {
               "type": "command",
               "command": "if command -v node >/dev/null 2>&1; then node ~/.claude/hooks/block-comments.mjs; else exit 0; fi"
             }
           ]
         }
       ]
     }
   }
   ```

   Se você já tem outros `PreToolUse`, **adicione** este objeto ao array — não substitua.
   O wrapper `if command -v node` garante que, sem `node` no PATH, o hook não trava nada.

3. Verifique (deve bloquear):

   ```bash
   echo '{"tool_name":"Write","tool_input":{"file_path":"x.ts","content":"// oi\nconst a=1\n"}}' \
     | node ~/.claude/hooks/block-comments.mjs; echo "exit=$?"   # exit=2 = bloqueado
   ```

O hook entra em vigor na próxima sessão do Claude Code (ou reinicie a atual).
