export const DESIGN_SYSTEM_BRIEF: string = [
  'DIRETRIZ DE DESIGN SYSTEM (tarefa com superficie visual): construa CONSUMINDO o design system do projeto — nao estetica avulsa.',
  '- Use SOMENTE os tokens do projeto (cor, tipografia, espacamento, raio, sombra) como fonte unica. Se existir uma camada de tokens (CSS vars, config do Tailwind/UnoCSS, ou um composable/arquivo de tema), IMPORTE e reutilize.',
  '- NUNCA use valor literal (cor hex/rgb solta, px avulso) no componente — sempre via token. Se faltar um token, crie-o na fonte unica e reutilize, nao espalhe o valor.',
  '- Reutilize os componentes PRIMITIVOS existentes (Button, Card, Input, etc.) antes de criar novos. Se precisar criar, faca como primitivo reutilizavel montado sobre os tokens.',
  '- UM unico sistema de estilo — nao misture (ex.: Tailwind + CSS solto + estilo inline). Siga o que ja esta no projeto.',
  '- Espacamento e tipografia na ESCALA definida; estados (hover/focus/disabled) padronizados; acessivel (foco visivel, contraste).',
  '- Se o projeto AINDA nao tem camada de tokens/primitivos, ESTABELECA uma fonte unica de tokens e monte os primitivos sobre ela — consistencia acima de novidade.',
].join('\n')
