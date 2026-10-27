# Plano Arquitetural: Orb Browser Tiered Engine (unkayOS 2.0)

Este documento especifica a arquitetura, desenho técnico e plano de implementação do **Orb Browser v2.0** no unkayOS, eliminando a dependência ingênua de `<iframe>` direto e estabelecendo um motor adaptativo em três camadas guiado por permissões e custos computacionais.

---

## 1. O Problema das Soluções Existentes

Navegadores emulados em Web Desktops (como no daedalOS e Puter) enfrentam impasses estruturais:
* **`<iframe>` direto**: Quebra em 80%+ dos sites modernos devido a `X-Frame-Options: SAMEORIGIN/DENY` e `Content-Security-Policy: frame-ancestors`.
* **Emulação x86 em Wasm (v86)**: Demora 20 a 40 segundos para dar boot em uma VM Linux e consome 300MB a 500MB de RAM do cliente por aba, sendo inviável para uso fluido no dia a dia.
* **Remote Browser Isolation (RBI) irrestrito**: Subir um Chromium headless no servidor para cada visitante anônimo (guest) esgota a memória do host e cria vetor imediato de ataque de negação de serviço (DoS).

---

## 2. A Solução: Arquitetura em 3 Camadas Adaptativas

O Orb Browser v2.0 detecta a identidade e o tier do usuário via `unkay.auth.getTier()` e entrega a estratégia técnica ótima:

```
                            [ Orb Browser ]
                                   │
               ┌───────────────────┼───────────────────┐
               ▼                   ▼                   ▼
          [ GUEST ]           [ STANDARD ]        [ SYSADMIN ]
      (Não Autenticado)   (Membro Autenticado)  (Curador / Infra)
               │                   │                   │
               ▼                   ▼                   ▼
       ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
       │   Camada 1:   │   │   Camada 2:   │   │   Camada 3:   │
       │  Client Wasm  │   │ Proxy Stream  │   │ Remote Canvas │
       │  & Modo RDA   │   │ Leve (Node)   │   │ Stream (RBI)  │
       └───────────────┘   └───────────────┘   └───────────────┘
```

### Camada 1: Visitante / Guest (Zero Custo de Servidor)
* **Objetivo**: Garantir leitura, documentação e multimídia integrada sem consumir RAM do servidor nem sofrer com telas brancas de erro.
* **Mecanismos**:
  1. **Navegação direta**: Abre no iframe isolado os sites que permitem incorporação; vídeos do YouTube usam o player youtube-nocookie.
  2. **Modo Leitor RDA**: Extrai texto pelo endpoint de leitura, que só aceita destinos HTTP(S) públicos, revalida redirecionamentos, limita duração e tamanho da resposta, aplica limite de requisições e não interpreta o HTML capturado como código da aplicação.
  3. **Exportação VFS**: Salva Web Clips em Markdown. No Guest, usa `/home/guest/Documents/web-clips/`; em perfis autenticados, mantém `/home/user/documents/web-clips/`.
  4. **Fallback Card RDA**: Quando o site bloqueia incorporação (ex.: Google/GitHub), oferece o Modo Leitor e a abertura no navegador hospedeiro.

### Camada 2: Membro Standard Autenticado (`auth:session`)
* **Objetivo**: Navegação web funcional sem bloqueios de `X-Frame-Options` e CSP.
* **Mecanismo**: **Streaming Reverse Proxy** no `compute-service` (`/api/proxy?url=...`):
  * O iframe recebe uma sessão curta emitida após validação do token do usuário; Guest só pode chamar o modo leitor limitado.
  * O servidor apenas faz o repasse de tráfego HTTP/HTTPS.
  * Aceita somente hosts públicos nas portas 80/443, revalida redirecionamentos e limita tempo e tamanho da resposta.
  * Remove políticas de frame e injeta `<base href="...">` usando a URL final após redirecionamentos.
  * Consumo insignificante (~20 KB de RAM por conexão, sem rodar Chromium).

### Camada 3: Curador / Sysadmin (`compute:websocket` / `compute:remote`)
* **Objetivo**: Isolamento total de navegador (RBI - Remote Browser Isolation).
* **Mecanismo**: WebSocket Stream (`/ws/browser`):
  * Sessão de Chromium headless controlada via CDP/Puppeteer.
  * Transmissão de frames e renderização em `<canvas>` interativo.
  * Captura de cliques, digitação e rolagem do mouse.

---

## 3. Plano de Desenvolvimento e Entregáveis

| Etapa | Componente | Descrição |
| :--- | :--- | :--- |
| **Fase 1** | `compute-service` | Implementação do endpoint de proxy streaming (`/api/proxy`) com remoção de headers de bloqueio e reescrita de links. |
| **Fase 2** | `apps/browser/index.html` | Interface moderna do Orb Browser com indicador de Tier, seletor de modo Web/Leitor, abas e viewport multi-camada. |
| **Fase 3** | `apps/browser/style.css` | Folha de estilos 100% aderente aos tokens `--rda-*`, Dark Theme e tipografia Archivo/Inter. |
| **Fase 4** | `apps/browser/main.js` | Lógica reativa da aplicação (gestão de abas, detecção de tier, modo leitor, exportação Markdown no VFS e navegação). |
| **Fase 5** | Testes e Build | Testes automatizados em Vitest (`tests/orb-browser-tiered.test.js`), build de produção e validação live. |
