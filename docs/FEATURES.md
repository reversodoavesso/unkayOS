# Features modulares e agnósticas

> Atualização: o boot agora lê configuração JSON e usa catálogo de plugins/bindings de identidade e acesso. O default é local; `import.meta.env` não seleciona mais o perfil em runtime. Veja [DEPLOYMENT.md](./DEPLOYMENT.md) para o contrato implementado e os limites desta primeira entrega. As seções históricas de perfis abaixo descrevem a base anterior a essa migração.

Este documento descreve a base da refatoração do unkayOS para um modelo de **kernel + features**.
O objetivo é permitir que capacidades do sistema sejam compostas, testadas e reutilizadas sem
depender do `SystemManager`, do DOM ou de singletons do unkayOS.

## Estrutura

```
core/
├── kernel/                 # infraestrutura agnóstica
│   ├── Kernel.js           # registro, dependências, ciclo de vida e capacidades
│   ├── defineFeature.js    # contrato e validação de uma feature
│   ├── events.js           # emitter isolado (sem DOM/globais)
│   └── index.js
├── features/               # features puras (sem imports do unkayOS)
│   ├── auth/               # sessão + mapa de tiers
│   ├── kv/                 # key-value namespaced com backend injetável
│   ├── fs/                 # fachada de file system sobre adapter
│   ├── ai/                 # cliente do gateway sobre transporte injetável
│   ├── packages/           # fachada do gerenciador de pacotes
│   ├── window/             # controles de janela via controller do host
│   ├── context-menu/       # menu de contexto via provider do host
│   ├── shortcuts/          # atalhos via registry injetado
│   └── index.js            # barrel + registerCoreFeatures()
├── apps/                   # catálogo de apps como features
│   ├── AppFeatureRegistry.js
│   └── index.js
├── host/                   # únicos arquivos que ligam o kernel ao unkayOS
│   ├── sharedFeatures.js   # features comuns aos perfis
│   ├── guestAuth.js        # identidade local (standalone)
│   ├── unkayosFeatures.js  # seletor de perfil (import dinâmico)
│   └── profiles/
│       ├── rda.js          # SSO + marketplace + gateway RDA
│       └── standalone.js   # limpo: sem SSO, marketplace ou IA RDA
├── SystemManager.js        # boot: registra e inicia as features do host
└── sdk/unkay.js            # composition root: liga features aos sistemas do unkayOS
```

## Regras de agnosticismo

Uma feature em `core/features/*`:

- **não importa** `core/SystemManager.js`, `core/AppManager.js` nem qualquer singleton do host;
- **não acessa** `window`, `document`, `localStorage` ou `fetch` diretamente;
- recebe tudo o que precisa por `config` (injeção) ou por `context.require(capability)`;
- expõe um objeto retornado por `setup(context)` cujas chaves são exatamente as capacidades declaradas.

O acesso ao host fica no **composition root** (`core/sdk/unkay.js`), que cria adapters e injeta
nas features.

## Contrato

```js
import { defineFeature } from '../../kernel/index.js';

export const exemploFeature = defineFeature({
    id: 'exemplo',                  // lowercase, dígitos, ponto ou hífen
    version: '1.0.0',
    description: 'Uma frase curta.',
    provides: ['exemplo'],          // capacidades publicadas
    requires: [],                   // capacidades obrigatórias (ordem de start)
    optionalRequires: [],           // capacidades usadas apenas se existirem
    after: [],                      // ids de features que devem iniciar antes
    setup(context) {
        return { exemplo: { ping: () => 'pong' } };
    },
    start(context, api) {},         // opcional, após o setup
    stop(context, api) {}           // opcional, antes de remover as capacidades
});
```

`defineFeature` valida o contrato e congela a definição. Erros de contrato são lançados no
registro; erros de dependência são lançados antes de qualquer `setup`.

## Ciclo de vida

1. `kernel.register(featureA, featureB)` — permitido apenas com o kernel `idle`.
2. `await kernel.start()` — resolve a ordem topológica por `requires` + `after`, executa `setup`
   em ordem, publica as capacidades e chama `start`.
3. `kernel.get(capability)` / `kernel.require(capability)` — acesso às capacidades.
4. `await kernel.stop()` — chama `stop` em ordem reversa, remove listeners do contexto e apaga
   as capacidades. Se um `setup` falhar, as features já iniciadas sofrem rollback.

O kernel é idempotente: chamadas concorrentes de `start`/`stop` compartilham a mesma promise.

## Contexto entregue às features

| Campo | Uso |
| --- | --- |
| `context.id` / `version` | Identidade da feature |
| `context.config` | Configuração injetada para esta feature |
| `context.logger` | Logger prefixado com o id |
| `context.on/once/emit` | Eventos; listeners são removidos automaticamente no `stop` |
| `context.has/get/require` | Acesso a capacidades de features anteriores |

## Como adicionar uma feature

1. Crie `core/features/<id>/index.js` exportando a factory e a definição.
2. Exporte ambos em `core/features/index.js` e inclua a definição em `coreFeatures`.
3. Injete as dependências no composition root.
4. Teste a factory isoladamente e o start pelo kernel.

## Uso direto no SDK

O SDK mantém exatamente a API pública anterior (`auth`, `fs`, `packages`, `ai`, `kv`, `window`,
`contextMenu`, `shortcuts`), mas agora é apenas composição:

```js
const sdk = createUnkaySDK(appCore, systemManager);
await sdk.kv.set('theme', { mode: 'dark' });
```

## Boot do sistema

`SystemManager` não possui mais fases hardcoded. Ele cria um `Kernel`, registra
`createUnkayosFeatures()` e chama `start()`. A ordem de inicialização é resolvida pelas
capacidades declaradas em `core/host/unkayosFeatures.js`:

```
events → core-fs → ... → wasm-vfs → auth → app-catalog → app-features
       → app-manager → packages → shell
```

- `getSystem(nome)` continua funcionando: consulta o kernel e cai para a view legada.
- `shutdown()` apenas chama `kernel.stop()`; os hooks de stop encerram apps, menus e o VFS Wasm.
- `SystemManager` aceita `{ featureFactory }` como seam de teste, sem inicializar o host real.
- O perfil ativo fica em `getSystem('hostProfile')` e em `getSystemStats().profile`.

## Perfis de host

O mesmo código gera três versões de produto, selecionadas por modo do Vite:

| Perfil | Comando | Identidade | Marketplace | IA | Apps RDA |
| --- | --- | --- | --- | --- | --- |
| `rda` | `npm run dev:rda` / `npm run build:rda` | AuthSystem + SSO | PackageManager real | Gateway RDA | habilitados |
| `standalone` | `npm run dev:standalone` / `npm run build:standalone` | `guestAuth` local | ausente | desativada | `store` e `openui` desligados; `user-profile` vira perfil local |
| `sso` | `npm run dev:sso` / `npm run build:sso` | provider injetado | ausente | desativada | `store` e `openui` desligados; `user-profile` usa o provider |

Regras:

- `resolveProfileName()` usa o argumento explícito, depois `VITE_UNKAY_PROFILE`, depois
  `import.meta.env.MODE` (`standalone`/`sso`); o padrão é `rda`.
- O `standalone` **não importa** `AuthSystem.js` nem `auth-config.js`: o seletor carrega o perfil
  com `import()` dinâmico, então o build limpo não avalia módulos de SSO.
- `guestAuth` é compatível com a API do AuthSystem (`getAPI`, `on/off`, `getCurrentUser`,
  `getAuthToken`, `hasPermission`, `hasRole`, `authenticatedRequest`, `getProviderInfo`), mas
  não fala com rede.
- Sem `packageManager`, apps que declaram essa capacidade ficam indisponíveis; `store` e `openui`
  são fixados como `enabled: false, locked: true` nos perfis sem RDA.
- `app:start:warning` continua sendo emitido para requisitos opcionais ausentes (ex.: terminal
  sem `packages`/`ai`).
- `createUnkaySDK(..., { aiEnabled: false })` faz `sdk.ai` lançar uma mensagem clara em vez de
  chamar o gateway.

### Identidade plug-and-play

Toda a UI deriva rótulos e fluxos de `resolveProviderInfo(auth)` (`core/identity/provider.js`).
Um SSO novo implementa:

```js
auth.getProviderInfo() => {
  id, label, providerName,
  mode: 'sso' | 'local',
  supportsLogin, supportsLogout,
  loginLabel, accountLabel,
  connectedDescription, loginDescription
}
```

e a API do AuthSystem (`getCurrentUser`, `getAuthToken`, `login`, `logout`, `getAPI`, `on/off`).
Com isso, `WelcomeSetup`, `user-profile` e o restante da UI não têm nenhuma string de RDA.

O perfil `sso` injeta esse provider sem carregar AuthSystem:

```js
// antes de /main.js (index.html ou script de deployment)
window.__UNKAY_IDENTITY_PROVIDER__ = () => createMySsoProvider();
```

`SystemManager({ identityProvider })` também aceita a factory diretamente em testes/embeds.

### O que muda na UI fora do perfil RDA

- **Boas-vindas**: sem “Entrar com RDA”; mostra a sessão local ou o `loginLabel` do provider.
- **Meu perfil**: a aba SSO some; o app mostra identidade local, preferências e armazenamento.
  O ícone da taskbar volta a abrir o perfil.
- **Configurações**: painel “Rede & Serviços RDA”, cartão MinIO e cartão “SSO Cluster” somem;
  a checagem `/api/compute/health` não roda.
- **Terminal**: opção e comando `mode compute` ficam indisponíveis; WASI/local continuam.
- **The Orb**: modo leitor e proxy RDA somem; navegação direta e abertura externa continuam.
- **Compute**: convite e setup não inicializam.

## Apps como features

Cada app declara suas capacidades em `apps/apps.json`:

```json
{ "id": "terminal", "path": "/apps/terminal/", "requires": ["auth", "fs"], "optionalRequires": ["packages", "ai"] }
```

O `AppFeatureRegistry` oferece:

| Operação | Efeito |
| --- | --- |
| `isEnabled(id)` | Estado efetivo (override > definição > `true` para apps desconhecidos) |
| `setEnabled(id, bool)` | Habilita/desabilita e persiste em `unkay_app_features`; apps `locked` recusam desativação |
| `unregister(id)` | Remove a definição e o override (usado ao desinstalar pacotes) |
| `missingRequirements(id)` | Capacidades obrigatórias ausentes no kernel |
| `missingOptionalRequirements(id)` | Capacidades opcionais ausentes; não bloqueia, gera `app:start:warning` |
| `isAvailable(id)` | `enabled && sem requisitos ausentes` |
| `list()` / `subscribe()` | Diagnóstico e notificação de mudanças |

O `AppManager` filtra apps desabilitados no carregamento e bloqueia `runApp` com
`app:start:error` (`disabled` ou `missing_requirements`). Capacidades são resolvidas por
`SystemManager.hasCapability()` (`auth`, `fs`, `packages`, `ai`, `window`). O `AppCore`
repete a checagem no preflight, então qualquer chamada direta respeita o catálogo.

### Mudanças em runtime

`AppManager.syncAppFeatures()` reage a `subscribe()` do registry e:

- remove do launcher apps desabilitados;
- carrega configs de apps recém-habilitados (sem recarregar a página);
- preserva pacotes instalados, que não existem em `apps.json`;
- emite `apps:catalog:changed`, consumido pela taskbar e pelo launcher.

A UI fica em **Configurações → Aplicativos** (`#panelApps`): lista o catálogo, mostra
requisitos/opcionais, bloqueia apps essenciais (`locked`) e alterna o estado na hora.

### Marketplace

O `PackageManager` recebe o registry, registra cada pacote instalado como definição
(`metadata.source = 'package'`) e remove a definição no uninstall. Assim o pacote aparece
em Configurações → Aplicativos e continua sujeito ao mesmo enable/disable.

### Diagnóstico

O **Gerenciador de Processos** exibe `kernel.describe()`: estado, features em execução,
capacidades publicadas e versão de cada feature, atualizado por eventos do kernel.

## Guard de arquitetura

`tests/architecture.test.js` falha se `core/kernel/**` ou `core/features/**`:

- importarem qualquer módulo fora dessas duas árvores;
- acessarem `window`, `document`, `localStorage`, `sessionStorage` ou chamarem `fetch()`.

## Validação

```sh
npx vitest run tests/kernel.test.js tests/features.test.js tests/app-features.test.js \
  tests/settings-app-features.test.js tests/system-manager.test.js tests/host-profiles.test.js \
  tests/welcome-setup-identity.test.js tests/architecture.test.js tests/unkay-sdk.test.js \
  tests/package-manager.test.js
npx eslint core/kernel core/features core/apps core/host core/SystemManager.js core/AppManager.js
```

## Estado

Implementado: kernel, 8 features agnósticas, SDK como composition root, boot via kernel,
catálogo de apps com enable/disable, `locked`, requisitos obrigatórios e opcionais,
sincronização em runtime, UI em Configurações, integração do marketplace, diagnóstico no
process-manager, guard de arquitetura e **perfis `rda` / `standalone`**.

Dívida externa: o `tsc --noEmit` global ainda falha em módulos legados (DOM/handlers
antigos). Os módulos criados pela refatoração estão sem diagnósticos; o total global
permanece na casa dos 360 erros pré-existentes.
