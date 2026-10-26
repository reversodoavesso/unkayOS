# Aparência do Unkayos e contrato com o RDA DS

Status: eixo de produto implementado no RDA DS e integrado ao Unkayos com presets ciano, violeta, azul, rosa, fúcsia, turquesa e índigo.

## Diagnóstico

O RDA DS oferece intenções semânticas (`primary`, `danger`, `success`, etc.), cores de membership e variantes de superfície. O `ThemeProvider` oferece tema claro/escuro e superfície. Isso não constitui uma API de accent arbitrário do usuário.

As ações do DS possuem um conjunto de tokens: fundo, texto, borda, hover e active. Texto de marca e foco também mudam conforme o tema. No Unkayos, o seletor alterava apenas `--rda-color-primary-400` e o alias `--color-primary-base` no elemento raiz. Componentes que usam outros tons, tokens semânticos ou cores próprias não acompanhavam a mudança. A cor escolhida também podia coincidir com alertas ou níveis de acesso.

## Comportamento implementado agora

- O DS exporta `UnkayosScope` em `@reversodoavesso/design-system/unkayos`, além de CSS para HTML nativo.
- O eixo de produto usa `data-rda-product="unkayos"` e `data-unkay-accent="cyan|violet|blue|rose|fuchsia|teal|indigo"`. Presets completos por tema são verificados por testes de contraste.
- O mapeamento altera tokens semânticos de ação primária e foco dentro do escopo. Intenção semântica, tamanho e superfície continuam independentes. Marca, feedback e membership preservam suas cores.
- A preferência persistida é um identificador de preset. O campo antigo `accentColor` não reescreve primitivos de marca.
- O shell e os apps usam o CSS e os ícones oficiais copiados com manifesto e verificação de integridade. Não há dependência de CDN durante a execução.
- O [guia prático](../APP_DEVELOPMENT.md), o gerador `npm run scaffold` e o exemplo `/patterns/unkayos` no catálogo do DS documentam a API real.

## Arquitetura adotada: camada de produto dentro do design system

Reutilizar os componentes e fundamentos do RDA DS. Criar contratos e composições específicos para o ambiente desktop quando o comportamento do Unkayos exigir; evitar uma cópia inteira do catálogo de botões, campos e diálogos.

| Camada | Responsabilidade | Personalização de accent |
| --- | --- | --- |
| RDA DS base | Marca, tipografia, espaçamento, superfícies, estados, membership e acessibilidade dos componentes | Mantém o contrato canônico atual |
| Camada Unkayos no DS | Aparência e estados de janelas, launcher, barra de tarefas e controles que adotem o accent explicitamente | Consome tokens próprios e paletas completas validadas |
| Aplicação Unkayos | Preferência do usuário, persistência, seleção do preset e escopo do shell | Escolhe um preset; não reescreve primitivos do DS |

O ponto de distribuição é `@reversodoavesso/design-system/unkayos`, com CSS e tokens utilizáveis pelo shell JavaScript atual. Wrappers React só são necessários para consumidores React. Esse entrypoint está implementado e compõe os componentes existentes.

### Contrato de cores implementado

Os tokens são escopados por `[data-rda-product="unkayos"][data-unkay-accent="preset"]`. Cada preset define o conjunto completo por tema:

| Token de produto | Uso |
| --- | --- |
| `--unkay-accent-solid` | Fundo de uma ação que adota o accent |
| `--unkay-accent-on-solid` | Texto/ícone sobre esse fundo |
| `--unkay-accent-hover` / `--unkay-accent-active` | Estados de interação |
| `--unkay-accent-subtle` / `--unkay-accent-on-subtle` | Seleção e navegação com fundo sutil |
| `--unkay-accent-border` | Borda de seleção |
| `--unkay-accent-focus` | Foco visível |

Uma cor hexadecimal isolada não é um preset. Os presets ciano, violeta, azul, rosa, fúcsia, turquesa e índigo passaram pelos testes em claro/escuro e pela verificação de independência das cores de feedback e membership.

### Componentes e composição

1. Aplicar aos elementos próprios do shell: janela, botão de app na barra, item do launcher e marcador de seleção/foco.
2. Esses componentes adotam o accent explicitamente e continuam usando medidas, tipografia, espaçamentos e comportamento do DS base.
3. Um botão de ação do produto pode compor o botão do DS, mapeando o contrato completo de estados somente naquela instância. Se o contrato atual não permitir isso, criar uma extensão documentada no DS antes de aplicar overrides no consumidor.
4. Botões destrutivos, mensagens de sucesso/erro/aviso, badges de acesso e marcas incorporadas preservam seus significados. Não recebem uma recoloração global.
5. Apps de terceiros não herdam a personalização sem optar pelo contrato do shell.

## Critérios de manutenção do seletor

- Tokens, componentes abrangidos e escopo documentados e disponíveis no catálogo do DS.
- Presets completos para claro e escuro, com contraste medido em texto, ícones, foco e seleção.
- Cobertura de default, hover, active, focus-visible, selected, disabled e loading.
- Estados semânticos e membership preservados ao alternar presets.
- Navegação por teclado e distinção de estados sem depender somente de cor.
- Testes de regressão e comparação visual no shell e em aplicações que adotarem o contrato.
- Preferência persistida como identificador de preset validado; migração explícita de versões anteriores.

O seletor está disponível com presets validados. Novas paletas entram somente após passar pelos mesmos critérios.
