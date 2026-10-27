# Revisão da loja e do gerenciador — 27/10/2026

## Problemas encontrados e corrigidos

1. A loja salvava apenas metadados e declarava sucesso, sem conteúdo executável nem registro no AppManager. O gerenciador agora exige conteúdo compatível, confirma persistência e registra uma janela executável.
2. O inventário considerava qualquer diretório como instalação. Agora verifica recibos, manifestos e interface; instalações antigas incompletas são identificadas e podem ser removidas ou reparadas.
3. A UI usava IDs, versões, permissões e tipos diferentes do contrato da API. A identidade canônica é `manifest.id`, com `catalogId` separado; o Studio incluído é reconhecido sem duplicação.
4. Os bloqueios de perfil eram apenas filtros visuais e o botão permitia instalar. O SDK e a API verificam publicação, perfil, runtime, permissões, integrações e conteúdo.
5. `/api/marketplace/` não tinha encaminhamento no Vite/Nginx; os dois foram corrigidos. Falhas de catálogo são visíveis e preservam o acesso aos apps locais.
6. A API aceitava autoria e revisão sem autenticação. Agora exige identidade verificada; a curadoria requer papel autorizado e não aceita o revisor declarado no formulário.
7. Submissões podiam substituir IDs existentes, e a revisão não conferia decisão ou versão. Agora protege autoria/IDs, compara SemVer e mantém a publicação atual enquanto uma atualização aguarda revisão.
8. A instalação não validava a integridade do conteúdo e o catálogo usava assinaturas fictícias. Os pacotes entregues têm SHA-256 verificado no cliente; aprovação não é apresentada como assinatura criptográfica.
9. A loja interpolava conteúdo remoto em HTML, tinha controles incompletos e cores fixas nos detalhes. O conteúdo textual é escapado; o layout usa controles e tokens oficiais, filtros por situação/categoria, detalhes acessíveis e ações de abrir/atualizar/remover/importar.
10. O Studio e o terminal não compartilhavam um instalador funcional. Agora usam `unkay.packages`; o terminal também implementa `unkay run`.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| Testes de PackageManager, Store, Sandbox, Studio, SDK e terminal | 41 passaram |
| Compute-service: testes de API, publicação, curadoria e runtime | 15 passaram |
| Build TypeScript do compute-service | Passou |
| Build de distribuição do unkayOS, release e integridade do DS | Passou |
| ESLint nos arquivos JavaScript revisados e nos novos testes/scripts | Sem erros ou avisos |
| Navegador: abertura dos 10 aplicativos de janela visíveis | Passou, sem erros não tratados |
| Navegador: instalação real por API, importação, sanitização, recarga e remoção preservando dados | Passou |
| Layout escuro, claro, janela de 390 px e detalhes em janela estreita | Verificado por captura; sem overflow horizontal |
| Suíte geral do unkayOS, preparação da release alpha.4 | 154 passaram |
| Typecheck global do unkayOS | Continua falhando na base; sem diagnósticos no novo PackageManager, adaptador ou Store |

Na validação inicial, o teste do leitor falhou porque seu mock de `fetch` não fornecia `response.headers`. O mock foi corrigido na preparação da release alpha.4 e a suíte completa passou. A checagem global de tipos continua com diagnósticos em outras partes da base, incluindo declarações de Window e elementos/eventos de DOM.

Na validação inicial, os testes de navegador usaram um compute-service local com um pacote OpenUI de validação aprovado em memória. O teste consultou a API pelo proxy, recebeu e verificou o hash real e instalou no VFS real do navegador. Essa etapa não alterou produção. Evidências locais: `browser-proof/store/validation.json` e capturas no mesmo diretório.

## Pendências de produto e infraestrutura

O [contrato do gerenciador](PACKAGE_MANAGER.md) descreve as APIs e os limites. O catálogo continua em memória; falta persistir submissões e revisões. Apps nativos, containers, serviços externos, vínculo de provedores e assinatura criptográfica aguardam implementação própria e são apresentados como indisponíveis. O inventário local ainda não tem separação por identidade SSO nem sincronização entre dispositivos. O gerenciador de arquivos legado usa outro VFS; o menu de aplicativos e `unkay run` são os lançadores funcionais dos pacotes instalados.
