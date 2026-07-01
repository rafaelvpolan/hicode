---
name: branch-from-main
description: "Antes de começar QUALQUER task, partir da branch principal (main) ATUALIZADA e só então criar a nova branch de trabalho. Use ao iniciar uma tarefa que vai gerar um PR, ou antes de criar qualquer branch de feature."
user-invocable: true
argument-hint: "[slug-da-branch]"
---

# /branch-from-main — sempre partir do `main` atualizado

**Regra do hicode:** toda nova branch de trabalho **nasce do `main` atualizado**. Nunca ramifique
de um estado velho, de `HEAD` qualquer, nem de outra branch de feature — isso gera PR sujo (arrasta
trabalho não-mergeado) e conflito de merge.

## Antes de começar a task

1. Descubra a branch base (default **`main`**; confirme no `config/repos.json` do repo-alvo).
2. **Atualize o main** (buscar + trazer o remoto):
   ```bash
   git fetch origin main
   git checkout main
   git pull --ff-only origin main
   ```
3. **Só então** crie a nova branch, a partir do main atualizado:
   ```bash
   git checkout -b hicode/<slug-da-branch>
   ```

## Modo worktree (isolamento por task — o modo do motor)

Para execuções paralelas, cada task vai num worktree próprio criado **direto de `origin/main`**
recém-buscado (sem tocar o checkout principal):
```bash
git fetch origin main
git worktree add -B hicode/<slug> ../.hicode-worktrees/<repo>/<slug> origin/main
```

## No motor autônomo (já aplicado)

O `runner.ts` **já cumpre esta regra** em `prepareBranch` → `ensureWorktree`: faz
`git fetch origin <base>` e cria o worktree da branch a partir de `origin/<base>` (main atualizado)
**antes de qualquer edição do agente**. Portanto todo card nasce do `main` mais recente e o PR
sai limpo (base `main`).

## Por quê

- **PR limpo:** o diff mostra só a task, sem arrastar commits não-mergeados de outra branch.
- **Menos conflito** no merge (parte do estado atual de produção).
- **Reprodutível:** cada task começa do mesmo ponto conhecido (`origin/main`).

## Anti-padrões

- ❌ Ramificar de `feat/x` ainda aberta (empilha PRs e mistura mudanças).
- ❌ Criar a branch sem `fetch`/`pull` (parte de um main local defasado).
- ❌ Trabalhar direto no `main`.
