# Gerenciador de pacotes e loja

O `PackageManager` é registrado no `SystemManager` depois do carregamento dos aplicativos do sistema. A loja, o Studio e o terminal usam a mesma API `unkay.packages`.

## Inventário e estados

O inventário combina os aplicativos incluídos em `apps/apps.json`, os pacotes realmente presentes no VFS e os metadados publicados por `/api/marketplace/apps`. A identidade de um pacote é `manifest.id`; o identificador do catálogo é separado em `catalogId`. O Studio oficial corresponde ao aplicativo `openui` já incluído no sistema.

| Estado | Significado |
| --- | --- |
| `system` | Incluído no sistema; acompanha as atualizações do unkayOS. |
| `installed` | Manifesto e interface presentes; registrado no menu. |
| `update` | Há versão superior no catálogo, comparada por SemVer. |
| `incomplete` | Registro antigo, manifesto inválido ou conteúdo ausente. Pode ser removido ou reparado quando há pacote disponível. |
| `available` | Publicação, conteúdo, perfil, permissões e runtime permitem instalar. |
| `blocked` | Uma ou mais condições impedem instalar ou abrir; motivos em `reasons`. |
| `pending` | Instalação, atualização ou remoção em andamento. |

`installed`, `canOpen`, `canInstall`, `canUpdate` e `canUninstall` são campos distintos. Uma atualização bloqueada não impede abrir uma versão local válida. A indisponibilidade do catálogo mantém os aplicativos locais utilizáveis e impede novas instalações por metadados antigos.

## API do SDK

```js
await unkay.packages.refresh();                 // VFS e catálogo remoto
await unkay.packages.refresh({ catalog: false });
const apps = unkay.packages.list();
const status = unkay.packages.status('meu-app');
await unkay.packages.install('meu-app');         // usa catalogId internamente
await unkay.packages.installLocal(bundle);      // objeto ou JSON .unkayapp
await unkay.packages.open('meu-app');
await unkay.packages.uninstall('meu-app');       // preserva data/
const unsubscribe = unkay.packages.subscribe(() => render());
unsubscribe();
```

O formato importável é JSON, com `format: "unkayapp-v1"`, um `manifest` válido e `files: { "spec.openui": "..." }`. A loja aceita arquivos de até 1 MB; a interface declarativa tem limite de 512 KB. Arquivos ZIP e bundles JavaScript ainda não são instaláveis.

A instalação grava a interface em `releases/<id>/spec.openui` e confirma `installation.json` após escrever os arquivos. Aguarda `fs.flush()` antes de informar sucesso. Uma falha restaura o recibo anterior. O adaptador `InstalledPackageApp` abre a interface sanitizada em uma janela própria. O boot restaura esses registros. Pacotes antigos do Studio com `package.json` e `spec.openui` continuam reconhecidos.

A remoção fecha as janelas e apaga recibos, interfaces e registro no menu; preserva `data/`. Um atalho `.desktop` é gravado no VFS como conveniência. O menu de aplicativos é o lançador funcional; o gerenciador de arquivos legado ainda usa outro sistema de arquivos e não interpreta esses atalhos.

No terminal: `unkay run <id>`, `unkay packages list`, `refresh`, `status <id>`, `install <id>`, `remove <id>` e `import <caminho.unkayapp>`.

## Contrato HTTP

| Rota | Comportamento |
| --- | --- |
| `GET /api/marketplace/apps` | Publicações aprovadas; filtros `category`, `runtime_profile`, `search` e `tier`. Inclui `installation.available`, `reason` e identificação dos apps incluídos. |
| `GET /api/marketplace/apps/:id` | Apenas apps publicados; não revela versões aguardando revisão. |
| `POST /api/marketplace/install` | Recebe `appId` do catálogo. Verifica publicação, token quando presente, perfil e disponibilidade; retorna manifesto, arquivos e SHA-256. Não declara que o pacote está instalado no navegador. |
| `POST /api/marketplace/submit` | Exige token; a autoria vem da identidade autenticada. Atualizações exigem o mesmo autor e versão superior. |
| `GET /api/marketplace/admin/queue` | Exige `curator`, `sysadmin`, `architect` ou `demiurge`. Inclui o conteúdo para revisão. |
| `POST /api/marketplace/admin/review` | Exige curadoria, decisão válida e versão exata. O revisor vem do token. A publicação anterior permanece disponível durante a análise de uma atualização. |

O Vite e o Nginx encaminham `/api/marketplace/` ao compute-service. O cliente verifica identidade, versão e hash do conteúdo recebido. O hash detecta divergência de conteúdo; não constitui assinatura criptográfica do autor. A aprovação também não cria uma assinatura fictícia.

## Limites atuais

- Pacotes instaláveis usam `type: "openui"` e `runtime_profile: "client-only"`. Código nativo, containers e serviços externos aguardam runtimes e entrega de conteúdo próprios. Shadow DOM não é isolamento de segurança para JavaScript arbitrário.
- O runtime aceita `storage:local`, `auth:session` e `ai:generate`. Permissões desconhecidas e provedores externos cuja vinculação não pode ser verificada bloqueiam a instalação.
- Os exemplos Euterpe, Cine e Cloud Shell permanecem visíveis com os motivos de indisponibilidade. Não há conteúdo executável publicado para eles.
- O catálogo e a fila ainda estão em memória no compute-service; submissões e decisões não sobrevivem ao reinício do serviço. As instalações locais persistem no VFS do navegador.
- O armazenamento atual usa `/home/user/apps`; não foi criado isolamento por identidade SSO. Sincronização de inventário entre dispositivos e assinatura de pacotes continuam pendentes.

## Verificação

`tests/package-manager.test.js` cobre inventário, migração, bloqueios, API, importação, hash, atualização, falha de persistência, concorrência, restauração, remoção e interface. Os testes do compute-service cobrem autenticação, curadoria, publicação e entrega de conteúdo.

`npm run verify:store -- --base=http://127.0.0.1:5178` verifica a loja em navegador real, importação, sanitização, restauração, remoção e layout claro/escuro/estreito. Requer o compute-service acessível pelo proxy. `--install-id=<manifest.id>` também exercita um pacote OpenUI previamente publicado por API. As imagens e o relatório ficam em `browser-proof/store/`.
