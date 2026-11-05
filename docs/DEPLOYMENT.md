# Configuração modular: identidade, políticas e serviços

O boot lê `/config/deployment.json`, valida o documento com JSON Schema 2020-12 e compõe identidade, política de acesso e serviços opcionais pelo catálogo local. O mesmo código servido funciona sem depender de transformação de `import.meta.env` nos módulos copiados.

## Gerar e validar configuração

```sh
npm run config:prepare -- --preset=standalone --output=public/config/deployment.json
npm run config:prepare -- --input=public/config/deployment.json
```

A segunda chamada valida schema, plugins, contratos, bindings e dependências e imprime o JSON normalizado. Em produção com nginx, montar o arquivo público em `/usr/share/nginx/html/config/deployment.json`. Somente dados públicos são aceitos pelos schemas atuais. Não colocar arquivos privados do backend em `public/`.

Exemplo suportado:

```json
{
  "schemaVersion": 1,
  "installationId": "my-desktop",
  "revision": "1",
  "preset": "standalone",
  "instances": {
    "account": { "plugin": "unkayos.local-identity", "config": {} },
    "policy": { "plugin": "unkayos.local-access", "config": {} }
  },
  "bindings": { "identity": "account.identity", "access": "policy.access" }
}
```

Os presets `standalone`, `sso` e `rda` geram documentos completos, sem mesclar serviços de um preset anterior. `neutral` é alias de geração para `standalone`. Os modos `dev:standalone`/`dev:sso`/`dev:rda` servem esse JSON; os builds equivalentes gravam o documento em `dist/config/`. Um arquivo explícito em `public/config/` tem precedência.

Sem JSON, apenas um HTTP 404 autoriza fallback portátil. A ponte temporária aceita `deployment.js` com `branding: 'rda'` explícito para manter os deploys existentes, inclusive seus IDs OIDC. Caso contrário, o default é local. Erro de rede, HTTP 5xx, JSON inválido ou HTML de fallback de SPA interrompem o boot. A função `loadDeployment({ required: true })` também rejeita 404 para consumidores que exigem configuração gerenciada.

## Plugins e bindings

O catálogo aprovado está em `core/host/plugins/catalog.js`. O JSON escolhe instâncias de plugins desse catálogo, não URLs de código. Esta entrega suporta:

| Plugin | Export | Uso |
|---|---|---|
| `unkayos.local-identity` | `identity@1` | Sessão local sem rede |
| `unkayos.gateway-identity` | `identity@1` | Sessão same-origin do BFF; nenhum token chega ao browser |
| `unkayos.injected-identity` | `identity@1` | Factory confiável `window.__UNKAY_IDENTITY_PROVIDER__`, registrada antes do boot |
| `rda.identity` | `identity@1` | Ponte para AuthSystem/OIDC RDA existente |
| `unkayos.local-access` | `access@1` | Política local explícita, nega ações desconhecidas |
| `unkayos.role-access` | `access@1` | Política local com tradução configurável de papéis para tiers de UI |
| `unkayos.gateway-access` | `access@1` | `POST /access/evaluate` same-origin; falha de rede nega acesso |
| `rda.access` | `access@1` | Política local e tiers legados RDA/Zitadel |
| `unkayos.http-ai` | `ai@1` | Gateway próprio same-origin, sem encaminhamento automático de token IdP |
| `rda.ai` | `ai@1` | Rotas legadas RDA com encaminhamento explícito de bearer token |
| `rda.sync` | `sync@1` | Adapter de compatibilidade para o driver MinIO existente |

Manifestos são declarados no catálogo com versão exata e `hostApi: 1`; negociação de faixas semânticas e distribuição externa de pacotes não foram implementadas. Os schemas de plugin aceitam apenas os campos declarados. O deployment suporta bindings `identity`/`access` obrigatórios e `ai`/`sync` opcionais. Portas de `files` e `compute` no browser continuam pendentes e não são aceitas silenciosamente; o backend de compute já expõe os adapters descritos abaixo.

Cada export recebe nome interno `instance.export`. Os bindings publicam `authSystem`, `accessPolicy`, `aiService` ou `syncService`. A composição permite instâncias com nomes diferentes, preservando a regra de um proprietário por capacidade do kernel. Valida todos os manifestos, configs, bindings e ciclos antes de importar módulos. Instância desabilitada não é importada; não pode ser destino de binding ativo.

O contrato de identidade transitório está em `core/contracts/identity.js`: inclui sessão, eventos `on/off`, metadados, API legada e `destroy()`. Providers são aguardados por `ready` quando presente; contrato inválido ou readiness rejeitada falham o start e liberam o provider retornado. O kernel destrói instâncias durante stop/rollback. Factories que falham antes de retornar ainda devem liberar os próprios recursos parciais. O AuthSystem libera handlers sem apagar a sessão persistida no shutdown.

## Direitos locais e SDK

```js
await sdk.access.can('files.local.read');        // true na política local
await sdk.access.can('compute.session.create'); // false na política local
```

A política local permite `files.local.read`, `files.local.write`, `apps.local.launch`, `settings.user.read` e `settings.user.write`; qualquer outra ação é negada. `GuestAuth.hasPermission()` usa a mesma política. A fachada SDK nega acesso sem política; uma falha na política rejeita a chamada, nunca concede acesso.

Isso ainda é uma consulta de UI/local, sem sandbox de apps nem autorização backend. RDA mantém seus tiers e checagens antigas para serviços remotos; a política local adicionada não substitui essas checagens nem anuncia direitos remotos. Perfis local/SSO rejeitam sync e IA desabilitados mesmo quando chamados diretamente pelo SDK.

## Validação e limites

```sh
npm run config:compile
npm run config:check
npm test
npm run build:dist
npm run preview -- --host 127.0.0.1 --port 5178
# Outro terminal:
npm run verify:deployment -- --base=http://127.0.0.1:5178
```

Os validators ESM são gerados com Ajv e empacotados para browser, sem imports npm, eval ou schemas remotos em runtime. `config:check` detecta divergência entre schema e código gerado; atualizar ambos no mesmo commit. A verificação browser usa contextos separados e cobre artefato portátil, SSO injetado, compatibilidade RDA e falha de configuração. Os cenários SSO provam composição, não login real no IdP.

Duas entregas desta etapa tornam a instalação conectada real sem depender de RDA: o **gateway próprio (`server/`)** com sessão e política no servidor, e o **escopo privado de armazenamento** por instalação/principal. Os adapters de browser (`unkayos.gateway-identity`, `unkayos.gateway-access`) só falam same-origin e nunca recebem tokens do provedor.

Ainda pendentes: homologação com login real no IdP, isolamento efetivo de apps externos (realm/iframe), grants por app, portas de `files`/`compute` no browser e migração completa de preferências por plugin. O driver MinIO permanece legado, sem cancelamento de sync em andamento. Os exemplos avançados do plano de arquitetura continuam sendo propostas; o schema implementado delimita o que pode ser executado nesta entrega.

## IA própria por configuração

Exemplo suportado em [config/examples/standalone-ai.json](../config/examples/standalone-ai.json):

```sh
npm run config:prepare -- --input=config/examples/standalone-ai.json --output=public/config/deployment.json
```

O plugin `unkayos.http-ai` aceita `basePath` e `timeoutMs` (100 a 300000 ms; default 30000). A rota é um caminho same-origin sem query, fragmento, segmentos relativos ou URL externa. Nenhuma chave de API pode ser colocada nessa configuração. O operador precisa disponibilizar um gateway compatível; esta entrega não cria esse servidor nem configura fornecedores upstream.

Protocolo HTTP desta versão:

- `POST <basePath>/chat`, corpo `{ "messages": [...] }`; resposta JSON `{ "reply": "..." }` ou `{ "content": "..." }`.
- `POST <basePath>/chat/stream`, mesmo corpo; resposta UTF-8 em texto simples (`text/plain` ou `application/octet-stream`). SSE/JSON são rejeitados com `PROTOCOL_ERROR`, sem exibir frames como texto.
- `sdk.ai.prompt(messages, { signal })` e `sdk.ai.stream(messages, onChunk, { signal })` aceitam cancelamento. Timeout cobre a operação completa; teardown aborta operações de IA ativas.
- Erros de HTTP, protocolo, timeout, cancelamento e serviço ausente têm códigos estáveis. Não há retry/fallback automático entre fornecedores.

O adapter envia cookies apenas same-origin, rejeita redirects e não descobre/encaminha token do IdP. O servidor continua responsável por autenticação, autorização, CSRF, quotas e credenciais do fornecedor. O adapter RDA mantém seus endpoints/bearer token explicitamente por compatibilidade; isso não implica que as rotas reais do ambiente de produção tenham sido homologadas.

IA é independente do preset/SSO. Quando um binding AI válido existe, `SystemManager.hasCapability('ai')` consulta o serviço real e o OpenUI deixa de ficar bloqueado por perfil RDA. Isso expressa disponibilidade técnica, não autorização do usuário.

## Política de tiers própria

Uma instalação pode trocar apenas `instances.policy`, preservando a identidade escolhida:

```json
{
  "plugin": "unkayos.role-access",
  "config": {
    "tierRoles": {
      "sysadmin": ["company-admin"],
      "adept": ["editor", "writer"]
    }
  }
}
```

O provider entrega `user.roles` como lista de strings e/ou `user.role`. A política traduz para os tiers legados do SDK, com precedência `demiurge`, `sysadmin`, `adept`, `standard`; usuário ausente é `guest`, sem papel mapeado é `standard`. Esses nomes de tier são compatibilidade de UI, sem concessão de privilégios remotos. `evaluate()` continua negando ações remotas; os direitos efetivos permanecem no backend. Claims Zitadel e papéis específicos RDA só são interpretados por `rda.access`. Sem política de tiers, a fachada genérica retorna apenas `guest`/`standard`.

## Gateway próprio (BFF)

`server/` é um processo Node sem dependências externas que serve sessão, autorização e IA para o mesmo artefato do desktop. Ele não conhece RDA: identidade e política vêm de arquivos privados validados no boot. Não publique esses arquivos em `public/`.

```sh
# exemplo mínimo (local): server/examples/server.json + access-policy.json
OIDC_CLIENT_SECRET=... AI_PROVIDER_API_KEY=... npm run server:start -- --config=server/examples/server.json
npm run test:server        # 37 testes de contrato, incluindo browser adapters
```

- `server.json` (schema `config/schemas/server.schema.json`): `listen`, `identity` (`local` ou `oidc`), `session`, `accessPolicy` e `ai`. Segredos são **somente referências de ambiente** (`clientSecretRef`, `apiKeyRef`); valores inline são rejeitados pelo schema e nunca aparecem em logs ou respostas.
- `access-policy.json` (schema `config/schemas/access-policy.schema.json`): regras declarativas com `allow`/`deny`, ações com sufixo `.*`, grupos/subjects/issuers, `ownership`, `requireMfa` e `requestsPerMinute`. Não há correspondência → nega; `deny` explícito prevalece; ação desconhecida não é permitida.
- Identidade: `mode: "local"` cria uma sessão de dispositivo explícita; `mode: "oidc"` usa Code Flow + PKCE com descoberta local, `state` vinculado ao navegador e `userinfo` para claims. Tokens do provedor ficam no servidor; o principal exposto é `{ id opaco, name, issuer, groups, mfa }`.
- Sessão: cookie opaco `HttpOnly`/`SameSite=Lax`/`Secure` (configurável), expiração por inatividade e absoluta, rotação no login/logout. Mutações exigem CSRF double-submit (`x-unkay-csrf` + cookie legível `${cookieName}_csrf`) e rejeitam `Origin`/`Sec-Fetch-Site` externos.
- Rotas: `GET /session`, `POST /session/login` (local), `GET /session/login` + callback (OIDC), `POST /session/logout`, `POST /access/evaluate`, `POST <ai.basePath>/chat`, `POST <ai.basePath>/chat/stream`, `GET /health`, `GET /ready`. O gateway não faz CORS e responde `no-store`.
- `--static=<dir>` (ou `UNKAYOS_STATIC_ROOT`) serve o artefato no mesmo origin: `config/` sempre `no-store`, `assets/` imutável, fallback de SPA apenas para rotas sem extensão e sem listagem de diretório. Sem a opção, arquivos continuam 404. Nginx pode continuar servindo o SPA e encaminhar apenas as rotas de API.
- IA: o alias público (`assistant`) é resolvido no servidor para provider/modelo reais; o upstream precisa falar OpenAI-compatible. O stream SSE é traduzido para texto UTF-8 simples, com timeout, cancelamento no disconnect e códigos estáveis (`TIMEOUT`, `CANCELLED`, `UPSTREAM_ERROR`, `PROTOCOL_ERROR`, `QUOTA_EXCEEDED`). Não há fallback silencioso entre fornecedores e credenciais nunca são encaminhadas ao browser.

Exemplo público correspondente: [config/examples/self-hosted.json](../config/examples/self-hosted.json). Ele liga `unkayos.gateway-identity`, `unkayos.gateway-access` e `unkayos.http-ai` (com `csrfCookie`) ao mesmo artefato; nenhuma edição de núcleo é necessária.

## Compute backend por contrato

`rda-services/compute-service` agora separa identidade e autorização em portas (`src/identity.ts`, `src/policy.ts`), com dois adapters de identidade:

- `COMPUTE_IDENTITY_MODE=rda` (default): claims legados `role`/`roles`/`urn:zitadel:*`, preservando o release RDA.
- `COMPUTE_IDENTITY_MODE=oidc`: nenhum claim RDA é interpretado implicitamente; papéis vêm de `COMPUTE_ROLE_CLAIMS`/`COMPUTE_GROUP_CLAIMS`.

`COMPUTE_ALLOWED_ROLES` define a lista explícita de papéis autorizados (default `sysadmin,archon,demiurge`, preservando o comportamento anterior). `COMPUTE_ACCESS_POLICY` aponta para um documento no formato de `access-policy.json`, permitindo `deny` explícito, `ownership`, MFA e limites por operação. `COMPUTE_EXPECTED_ISSUERS` rejeita issuers não configurados, mesmo que o token seja válido. Política inválida falha no parse, nunca em allow.

## Escopo privado de armazenamento

O worker do VFS não grava mais em `unkay_vfs_snapshot.json` na raiz do OPFS. O caminho é derivado por SHA-256 de instalação + principal:

```text
unkayos/v1/<installation>/<principal|anonymous>/principal/vfs-snapshot.json
```

- `core/utils/storageNamespace.js` deriva o namespace sem expor subject/e-mail em nomes de diretório.
- `core/host/storageScope.js` aplica o namespace no boot (após identidade), escuta `change` de identidade, serializa troca com escritas pendentes e anuncia o escopo via `localStorage` + `BroadcastChannel`. Outra aba só adota o namespace após revalidar sua própria sessão.
- O snapshot pré-namespace é importado **uma única vez** por instalação. Em perfis com login (RDA/SSO/BFF), a importação é adiada até o primeiro principal autenticado existir, para não deixar arquivos antigos presos no namespace anônimo; perfis somente-dispositivo migram no boot. O arquivo legado permanece intacto como backup e nunca é carregado em uma segunda identidade.
- KV de apps passa a usar `<principal>::<app>`; a chave antiga sem escopo é lida uma vez e migrada na primeira leitura. Preferências de aparência/área de trabalho continuam por dispositivo.




