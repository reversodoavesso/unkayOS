# Diretrizes de Desenvolvimento de Aplicativos para unkayOS 2.0 (AI & Native App Guidelines)

Este guia estabelece o padrão oficial de arquitetura, design visual, componentes e APIs do sistema para a criação de aplicativos no **unkayOS 2.0**, seja por desenvolvedores humanos ou por agentes e modelos de Inteligência Artificial (Generative UI, OpenUI Studio, Copilot, etc.).

---

## 1. Filosofia de Arquitetura do unkayOS 2.0

O unkayOS é um sistema operacional web desktop construído sobre três pilares técnicos:
1. **Microkernel WebAssembly & Armazenamento OPFS**: Operações de alta performance rodam em WebAssembly (Rust) com persistência real em Origin Private File System (OPFS).
2. **Isolamento e Segurança Declarativa**: Todo aplicativo declara permissões explícitas em seu manifesto (`permissions: [...]`) e executa em ambiente controlado com **Shadow DOM Sandbox** e escopo estrito de sistema de arquivos (VFS).
3. **Consistência Visual Canônica com RDA Design System**: Nenhuma aplicação deve usar paletas de cores arbitrárias ou estilos desconectados. Todo layout e elemento visual deve consumir estritamente as variáveis e regras do `@reversodoavesso/design-system` (Dark Theme padrão com identidade Cyan).

---

## 2. Estrutura Canônica de Arquivos de um Aplicativo

Todo aplicativo nativo ou modular do unkayOS reside em um diretório próprio (ex.: `/apps/<app-id>/` no sistema ou `/home/user/apps/<app-id>/` no VFS do usuário) contendo 5 arquivos essenciais:

```
apps/<app-id>/
├── package.json      # Manifesto do aplicativo, permissões e metadados
├── config.json       # Configuração de renderização da janela nativa
├── index.html        # Estrutura semântica do documento (HTML5)
├── style.css         # Estilos escopados utilizando tokens do RDA DS
├── main.js           # Classe controladora estendendo BaseApp
└── icon.svg          # Ícone vetorial canônico (viewBox 0 0 24 24)
```

---

## 3. Especificação do Manifesto (`package.json` e `config.json`)

### 3.1. `package.json` (Manifesto Modular & Sandbox)
```json
{
  "id": "meu-app-id",
  "name": "Meu Aplicativo unkayOS",
  "version": "1.0.0",
  "description": "Descrição clara do propósito da aplicação.",
  "type": "native",
  "runtime_profile": "client-only",
  "category": "utilities",
  "entrypoint": "main.js",
  "icon": "icon.svg",
  "permissions": [
    "storage:local",
    "ai:generate"
  ],
  "window": {
    "width": 800,
    "height": 540,
    "minWidth": 480,
    "minHeight": 360,
    "resizable": true
  }
}
```

### 3.2. `config.json` (Configuração da Janela no WindowManager)
```json
{
  "app_name": "Meu Aplicativo unkayOS",
  "icon_url": "icon.svg",
  "dirApp": "index.html",
  "jsFile": "main.js",
  "styleFile": "style.css",
  "mode": "system_window",
  "width": "800px",
  "height": "540px",
  "x_position": "15vw",
  "y_position": "10vh",
  "minWidth": 480,
  "minHeight": 360,
  "autorun": false,
  "hidden": false
}
```

### 3.3. Tabela de Permissões Disponíveis

| Permissão | Finalidade | Escopo & Restrição de Segurança |
| :--- | :--- | :--- |
| `storage:local` | Armazenamento de dados no VFS | Restrito a `/home/user/apps/<app-id>/data/` |
| `storage:cloud` | Sincronização em nuvem via MinIO | Exige usuário autenticado (`auth:session`) |
| `ai:generate` | Chamadas à IA Generativa do sistema | Acesso à API `unkay.ai.prompt(...)` |
| `auth:session` | Identidade e credenciais do usuário | Acesso a `unkay.auth.getUser()`, `getTier()` e JWT |
| `compute:wasm` | Execução de computação WebAssembly | Instanciação de micro-módulos Wasm locais |
| `compute:websocket` | Acesso a containers Linux sob demanda | Conexão com compute-service (exige tier sysadmin) |
| `audio:worklet` | Processamento DSP de áudio em tempo real | Instanciação de AudioContext e AudioWorkletNode |

---

## 4. Padrões de Design: `@reversodoavesso/design-system` (RDA DS)

Todas as cores, fontes, raios de borda e espaçamentos devem ser definidos exclusivamente por meio das variáveis CSS do Design System. É **terminantemente proibido** utilizar cores hexadecimais aleatórias diretamente no CSS (como `#1e293b`, `#ff0055`, etc.).

### 4.1. Tokens Principais de Cores e Superfícies

```css
:root {
  /* Marca e Destaque Principal (Cyan RDA) */
  --rda-color-primary-500: #06b6d4; /* Cor primária de ação e foco */
  --rda-color-primary-400: #22d3ee; /* Variação clara para hovers e badges */
  --rda-color-primary-600: #0891b2; /* Variação escura para botões ativos */

  /* Superfícies Semânticas (Dark Theme Canônico) */
  --rda-surface-primary: #0a0a0a;   /* Fundo principal da aplicação/janela */
  --rda-surface-secondary: #141414; /* Painéis, toolbars, sidebars */
  --rda-surface-tertiary: #1e1e1e;  /* Cartões, containers secundários */
  --rda-surface-card: #141414;      /* Superfície padrão de cards */
  --rda-surface-hover: #262626;     /* Efeito de hover em itens e botões */
  --rda-surface-active: #333333;    /* Efeito de clique ativo */

  /* Conteúdo e Tipografia */
  --rda-content-primary: #fafafa;   /* Texto principal de alto contraste */
  --rda-content-secondary: #e5e5e5; /* Texto de leitura padrão */
  --rda-content-tertiary: #a3a3a3;  /* Texto de apoio */
  --rda-content-muted: #737373;     /* Labels, rodapés e placeholders */
  --rda-content-brand: #22d3ee;     /* Links e marcas em destaque */

  /* Bordas */
  --rda-border-primary: #2d2d2d;    /* Divisórias de painéis e cards */
  --rda-border-subtle: #1e1e1e;     /* Linhas secundárias sutis */
  --rda-border-focus: #22d3ee;      /* Indicador de foco acessível */
  --rda-border-hover: #444444;      /* Hover sobre bordas interativas */

  /* Estados e Status */
  --rda-status-success: #10b981;    /* Sucesso e status online */
  --rda-status-warning: #f59e0b;    /* Avisos e pendências */
  --rda-status-error: #f43f5e;      /* Erros e ações destrutivas */
  --rda-status-info: #0ea5e9;       /* Notificações informativas */

  /* Tipografia */
  --rda-font-family-heading: "Archivo", sans-serif;
  --rda-font-family-base: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --rda-font-family-mono: "Fira Code", monospace;

  /* Raios de Borda */
  --rda-radius-sm: 0.25rem;  /* 4px */
  --rda-radius-md: 0.375rem; /* 6px */
  --rda-radius-lg: 0.5rem;   /* 8px */
  --rda-radius-full: 9999px; /* Pílulas e avatares circulares */
}
```

---

## 5. Regras Rígidas de Iconografia

Os ícones de aplicativos no unkayOS seguem uma linguagem minimalista, moderna e linear integrada à barra de tarefas e ao desktop:

1. **Formato**: Arquivo SVG puro com `viewBox="0 0 24 24"`.
2. **Traço / Silhouette**: Traço branco puro (`stroke="#ffffff"` ou `fill="#ffffff"`), com espessura padrão `stroke-width="2"`, `stroke-linecap="round"` e `stroke-linejoin="round"`.
3. **Fundo**: **100% transparente** (`fill="none"` no elemento `<svg>`).
4. **Proibição**: **NÃO crie blocos com fundos coloridos** (como retângulos arredondados azuis, vermelhos ou verdes com o ícone dentro). O desktop do unkayOS renderiza os ícones diretamente sobre o papel de parede e na barra de tarefas escura.

### Exemplo de Ícone Conforme (`icon.svg`):
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="18" height="18" rx="2"/>
  <path d="M3 9h18"/>
  <path d="M9 21V9"/>
</svg>
```

---

## 6. Componentes Canônicos de UI (HTML & CSS)

Ao criar interfaces declarativas ou código HTML para o unkayOS, utilize as classes e padrões abaixo:

### 6.1. Botões
```html
<!-- Botão Primário (Ação principal em Cyan) -->
<button class="rda-btn rda-btn-primary">Confirmar Ação</button>

<!-- Botão Secundário (Superfície escura com borda) -->
<button class="rda-btn rda-btn-secondary">Cancelar</button>

<!-- Botão Destrutivo (Alerta/Erro) -->
<button class="rda-btn rda-btn-danger">Excluir Registro</button>
```

```css
.rda-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: var(--rda-font-family-base);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: var(--rda-radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.rda-btn-primary {
  background-color: var(--rda-color-primary-500);
  color: #021a1a;
  font-weight: 700;
  border-color: var(--rda-color-primary-400);
}
.rda-btn-primary:hover {
  background-color: var(--rda-color-primary-400);
}

.rda-btn-secondary {
  background-color: var(--rda-surface-tertiary);
  color: var(--rda-content-primary);
  border-color: var(--rda-border-primary);
}
.rda-btn-secondary:hover {
  background-color: var(--rda-surface-hover);
}

.rda-btn-danger {
  background-color: rgba(244, 63, 94, 0.15);
  color: var(--rda-status-error);
  border-color: rgba(244, 63, 94, 0.3);
}
.rda-btn-danger:hover {
  background-color: var(--rda-status-error);
  color: #ffffff;
}
```

### 6.2. Cartões & Painéis de Dados (`.rda-card`)
```html
<div class="rda-card">
  <div class="rda-card-header">
    <h4 class="rda-card-title">Visão Geral do Serviço</h4>
    <span class="rda-badge rda-badge-cyan">v2.0 Ativo</span>
  </div>
  <p class="rda-card-body">Texto descritivo do cartão renderizado com alto contraste.</p>
</div>
```

```css
.rda-card {
  background-color: var(--rda-surface-secondary);
  border: 1px solid var(--rda-border-primary);
  border-radius: var(--rda-radius-lg);
  padding: var(--rda-spacing-4, 16px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rda-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rda-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--rda-content-primary);
  font-family: var(--rda-font-family-heading);
}
.rda-card-body {
  margin: 0;
  font-size: 13px;
  color: var(--rda-content-secondary);
  line-height: 1.5;
}
```

### 6.3. Badges de Status (`.rda-badge`)
```html
<span class="rda-badge rda-badge-cyan">Cyan Brand</span>
<span class="rda-badge rda-badge-success">Online</span>
<span class="rda-badge rda-badge-warning">Pendente</span>
```

```css
.rda-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--rda-radius-full);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.rda-badge-cyan {
  background: rgba(6, 182, 212, 0.15);
  color: var(--rda-color-primary-400);
  border: 1px solid rgba(6, 182, 212, 0.3);
}
.rda-badge-success {
  background: rgba(16, 185, 129, 0.15);
  color: var(--rda-status-success);
  border: 1px solid rgba(16, 185, 129, 0.3);
}
```

### 6.4. Formulários e Campos de Entrada (`.rda-input`)
```html
<div class="rda-field">
  <label class="rda-label" for="username">Nome de Usuário:</label>
  <input class="rda-input" type="text" id="username" placeholder="demiurge_user" />
</div>
```

```css
.rda-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rda-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--rda-content-secondary);
}
.rda-input {
  background-color: var(--rda-surface-primary);
  border: 1px solid var(--rda-border-primary);
  border-radius: var(--rda-radius-md);
  color: var(--rda-content-primary);
  font-family: inherit;
  font-size: 13px;
  padding: 8px 12px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s ease;
}
.rda-input:focus {
  border-color: var(--rda-border-focus);
}
```

---

## 7. Catálogo Completo das APIs do Sistema (`unkay` SDK)

Toda aplicação em execução recebe acesso ao objeto global `unkay` ou ao `scopedSDK` injetado pelo `AppSandbox`:

### 7.1. Sistema de Arquivos Virtual (`unkay.fs`)
*Exige permissão `storage:local`*.
```javascript
// Escrever arquivo de texto
await unkay.fs.writeFile('dados.json', JSON.stringify({ items: [1, 2, 3] }));

// Ler arquivo como texto UTF-8
const text = await unkay.fs.readText('dados.json');

// Ler arquivo binário
const buffer = await unkay.fs.readFile('imagem.png');

// Listar arquivos no diretório de dados
const files = await unkay.fs.list();

// Criar diretório (recursivo opcional)
await unkay.fs.mkdir('backups', true);

// Verificar existência
const exists = await unkay.fs.exists('dados.json');
```

### 7.2. Persistência Chave-Valor Isolada (`unkay.kv`)
```javascript
// Salvar preferência (isolada por app ID automaticamente)
await unkay.kv.set('lastTab', 'dashboard');

// Recuperar preferência
const lastTab = await unkay.kv.get('lastTab');
```

### 7.3. Inteligência Artificial Generativa (`unkay.ai`)
*Exige permissão `ai:generate`*.
```javascript
const response = await unkay.ai.prompt([
  { role: 'system', content: 'Você é um assistente técnico do unkayOS.' },
  { role: 'user', content: 'Resuma os logs de execução recentes.' }
]);
console.log(response.content);
```

### 7.4. Autenticação e Sessão do Usuário (`unkay.auth`)
*Exige permissão `auth:session`*.
```javascript
// Obter tier do usuário ('guest' | 'standard' | 'curator' | 'sysadmin')
const tier = unkay.auth.getTier();

// Obter dados do usuário
const user = unkay.auth.getUser(); // { id, username, email }

// Obter token JWT para requisições seguras
const token = unkay.auth.getToken();
```

### 7.5. Controle de Janela (`unkay.window`)
```javascript
// Atualizar o título da janela na barra superior
unkay.window.setTitle('Documento Editado *');

// Fechar a janela do aplicativo
unkay.window.close();
```

### 7.6. Barramento de Eventos Inter-Processos (`unkay.events`)
```javascript
// Escutar evento de outro aplicativo ou do sistema
unkay.events.on('system:theme-changed', (theme) => {
  console.log('Tema alterado:', theme);
});

// Emitir evento
unkay.events.emit('my-app:job-finished', { jobId: 123 });
```

---

## 8. Ciclo de Vida da Aplicação (`BaseApp`)

Toda aplicação em JavaScript deve estender a classe `BaseApp`:

```javascript
import { BaseApp } from '../../core/BaseApp.js';
import { unkay } from '../../core/sdk/unkay.js';

export default class MyApp extends BaseApp {
    constructor(CORE, standardAPIs) {
        super(CORE, standardAPIs);
        this.state = {};
    }

    /**
     * Invocado quando a janela do aplicativo é montada na tela.
     */
    async onRun() {
        console.log('[MyApp] Inicializando...');
        this.setupDOM();
        this.setupEventListeners();
    }

    setupDOM() {
        // Use this.$() para seletores escopados dentro do aplicativo
        const titleEl = this.$('#appTitle');
        if (titleEl) titleEl.textContent = 'unkayOS Ready';
    }

    setupEventListeners() {
        const btn = this.$('#myActionBtn');
        if (btn) {
            btn.addEventListener('click', () => this.handleAction());
        }
    }

    async handleAction() {
        unkay.window.setTitle('Processando...');
        await unkay.kv.set('status', 'ativo');
        unkay.window.setTitle('Concluído');
    }

    /**
     * Invocado quando a janela é fechada pelo usuário ou sistema.
     * Limpe intervalos, conexões WebSocket, áudio e listeners aqui.
     */
    onCleanup() {
        console.log('[MyApp] Limpando recursos da aplicação...');
    }
}
```

---

## 9. Template de Prompt de Sistema para IAs Gerarem Apps no unkayOS

Ao orientar um LLM (como Gemini, Claude ou GPT) a criar um aplicativo para o unkayOS, utilize o prompt abaixo como System Prompt:

````markdown
Você é um desenvolvedor sênior de aplicações para o unkayOS 2.0.
Sua tarefa é gerar uma aplicação compatível com o ecossistema unkayOS.

Regras Obrigatórias:
1. Respeite estritamente o Design System (@reversodoavesso/design-system):
   - Use as variáveis CSS:
     --rda-surface-primary: #0a0a0a
     --rda-surface-secondary: #141414
     --rda-surface-tertiary: #1e1e1e
     --rda-border-primary: #2d2d2d
     --rda-content-primary: #fafafa
     --rda-content-secondary: #e5e5e5
     --rda-content-muted: #737373
     --rda-color-primary-500: #06b6d4 (Cyan)
     --rda-color-primary-400: #22d3ee
   - Proibido cores arbitrárias fora dos tokens.
2. Iconografia:
   - Forneça um icon.svg com viewBox="0 0 24 24", fill="none", stroke="#ffffff", stroke-width="2". Fundo 100% transparente.
3. Arquitetura:
   - Forneça a estrutura completa contendo:
     * package.json (com permissions apropriadas: storage:local, ai:generate, etc.)
     * config.json (com dimensões e configurações da janela)
     * index.html (estrutura semântica)
     * style.css (classes .rda-* e variáveis CSS)
     * main.js (classe estendendo BaseApp com onRun() e onCleanup())
4. Não utilize frameworks externos desnecessários (React, Vue, jQuery) a menos que explicitamente solicitado. Priorize JavaScript ES6+ nativo e Web APIs.
````
