# unkayOS — Modular Web Operating System

## Create apps with the RDA Design System

The [practical app guide](docs/APP_DEVELOPMENT.md) covers official controls, tokens, icons, product accents, lifecycle and persistence. While the local server is running, open `/design-system/guide.html`. The SDK and OpenUI agent consume the same guide.

```sh
npm run scaffold -- --id my-notes --name "My Notes" --icon file-text --register
npm run ds:check
```

**unkayOS** is a fully-featured web operating system built with modern vanilla JavaScript and ES modules. It delivers a native desktop experience in the browser with advanced window management, modular applications, and an event-driven architecture.

## The Story

unkayOS started as a personal learning project — a way to sharpen my web development skills by going all-in on vanilla JavaScript, no frameworks, no shortcuts. The idea was simple: build something real using just the fundamentals and see how far I could push it.

What began as a playground for learning DOM manipulation, event handling, and CSS layout gradually turned into something bigger. As I kept building, I realized I wanted more than just a demo — I wanted a system where I could spin up small apps whenever a new idea hit me. A terminal emulator one week, a file manager the next, maybe a little game after that.

So unkayOS evolved into a modular desktop environment that runs in the browser — a personal hub for experimenting with ideas. Each app is self-contained, follows the same simple pattern, and plugs into the system without touching the core. It's become the place where I prototype, explore, and learn by building things I'm curious about.

The whole project is still vanilla JS by design. No React, no Vue, no Angular — just ES modules, a clean architecture, and the satisfaction of understanding every line of code that runs.

## Key Features

### Window System
- Dynamic z-index management with hierarchical layers (WindowLayerManager)
- Full resize support via edges and corners
- Drag & drop with smart prevention for maximized windows
- Multiple simultaneous instances of the same app

### Event-Driven Architecture
- Global EventBus for decoupled module communication
- Controlled lifecycle with automatic init and cleanup
- Integrated CLI commands for system control

### Modular Apps
- BaseApp class with DOM isolation and built-in utilities
- Dynamic loading of CSS and JavaScript on demand
- Per-instance scoping

### Robust Core
- SystemManager for centralized state and singleton management
- Design system with standardized tokens for visual consistency
- Phased boot sequence with controlled dependencies
- Automatic cleanup to prevent memory leaks

## Project Structure

```
unkayOS/
├── index.html                # Main entry point
├── main.js                   # System initialization (SystemManager)
├── package.json              # Dev dependencies & npm scripts
├── vite.config.js            # Vite build system & dev server
├── eslint.config.js          # ESLint v9 flat config
├── .prettierrc               # Prettier formatting config
├── tsconfig.json             # TypeScript checkJs config
├── apps/                     # System applications
│   ├── apps.json             # App registry
│   ├── terminal/             # Integrated terminal
│   ├── browser/              # Web browser (theorb)
│   ├── clock/                # Clock & calendar
│   ├── system-info/          # System information
│   ├── process-manager/      # Process manager
│   ├── file-manager/         # File manager
│   ├── text-editor/          # Text editor
│   ├── taskbar/              # Taskbar
│   └── about/                # About screen
├── core/                     # System core
│   ├── SystemManager.js      # Centralized state management
│   ├── AppManager.js         # App lifecycle management
│   ├── AppWindowSystem.js    # Window system
│   ├── AppCustomUI.js        # Desktop UI apps
│   ├── AppCore.js            # App core runtime
│   ├── BaseApp.js            # Base class for apps
│   ├── WindowLayerManager.js # Z-index management
│   ├── DragManager.js        # Drag system
│   ├── eventBus.js           # Event system
│   ├── FileSystem.js         # Virtual filesystem
│   ├── KeyboardManager.js    # Keyboard management
│   ├── AuthSystem.js         # Authentication system
│   ├── LoadingManager.js     # Loading management
│   ├── LoadingUI.js          # Loading UI
│   ├── LazyResourceLoader.js # Lazy resource loading
│   ├── MenuApps.js           # App menu
│   ├── PositionManager.js    # Window positioning
│   ├── types/                # TypeScript type definitions (.d.ts)
│   │   ├── BaseApp.d.ts
│   │   ├── EventBus.d.ts
│   │   ├── FileSystem.d.ts
│   │   ├── AppManager.d.ts
│   │   └── SystemManager.d.ts
│   └── utils/                # System utilities
├── design-system/            # Design system
│   └── styles/
│       ├── tokens.css        # Centralized design tokens
│       ├── base.css          # Base styles
│       ├── typography.css    # Typography system
│       ├── icons.css         # Icon styles
│       └── main.css          # Main styles
├── docs/                     # Technical documentation
│   ├── STATE_MANAGEMENT_GUIDE.md
│   ├── TOKEN_GUIDE.md
│   ├── FILE_SYSTEM_GUIDE.md
│   └── LOADING_SYSTEM.md
├── assets/                   # Static resources
│   ├── icons/                # System & app icons
│   ├── images/               # Images & wallpapers
│   └── style/                # Global styles
└── auth/                     # Authentication
    └── callback.html         # OAuth callback
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Development
```bash
# Clone the repository
git clone https://github.com/MaiconSlavieiro/unkayOS.git
cd unkayOS

# Install dev dependencies
npm install

# Start the dev server with HMR
npm run dev

# Open in browser
http://localhost:5173
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build with tree-shaking and sourcemaps |
| `npm run preview` | Preview the production build |
| `npm run test` | Run tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint with ESLint |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Check formatting |
| `npm run typecheck` | Type-check with TypeScript (checkJs) |
| `npm run scaffold` | Scaffold a new app |

### Live Preview
Try unkayOS in your browser: [unkayos.reversodoavesso.com](https://unkayos.reversodoavesso.com)

## System Architecture

### Boot Sequence
SystemManager orchestrates initialization in 4 phases:

```javascript
await systemManager.initialize(desktop);

// Access systems via SystemManager
const appManager = systemManager.getSystem('appManager');
const fileSystem = systemManager.getSystem('fileSystem');
const keyboardManager = systemManager.getSystem('keyboardManager');
```

### Window Layer Hierarchy
```
NOTIFICATION:     30000   # System notifications
MODAL:           20000   # Modals and dialogs
MENU:            15000   # Context menus
TASKBAR:         10000   # Taskbar
DRAGGING:         9000   # Elements being dragged
WINDOWS_MAX:      8999   # Maximized windows
WINDOWS_BASE:      100   # Normal windows (increments dynamically)
DESKTOP_APPS:        5   # Desktop widgets
DESKTOP_BACKGROUND:  0   # Wallpaper
```

### System Events
- `system:ready` — All systems initialized
- `system:shutdown` — System shutting down
- `app:start` / `app:stop` — Start/stop an app
- `app:started` / `app:stopped` — App lifecycle notifications
- `app:killall` — Kill all running apps

## Building Apps

Every app follows the same structure:

```
my-app/
├── config.json    # App configuration
├── index.html     # UI markup
├── main.js        # App logic (extends BaseApp)
├── style.css      # Styles (use design tokens)
└── icon.svg       # App icon
```

### config.json
```json
{
  "app_name": "My App",
  "icon_url": "icon.svg",
  "dirApp": "index.html",
  "jsFile": "main.js",
  "styleFile": "style.css",
  "mode": "system_window",
  "width": "800px",
  "height": "500px",
  "autorun": false,
  "hidden": false
}
```

### main.js
```javascript
import { BaseApp } from '/core/BaseApp.js';

export default class MyApp extends BaseApp {
  onRun() {
    const button = this.$('#my-button');
    button.addEventListener('click', () => this.handleClick());

    this.registerKeyboardShortcut('Ctrl+S', () => this.save());
  }

  onCleanup() {
    // Automatic cleanup via SystemManager
  }

  handleClick() {
    // Use this.$() for scoped DOM access
    const output = this.$('#output');
    output.textContent = 'Hello from unkayOS';
  }
}
```

### DOM Isolation
```javascript
// Never do this in apps
document.querySelector('#myButton');

// Always use scoped access
this.$('#myButton');
```

### Communication via EventBus
```javascript
import eventBus from '/core/eventBus.js';

eventBus.emit('app:start', { appId: 'browser', params: { url: 'https://example.com' } });
eventBus.on('app:started', ({ appId, instanceId }) => {
  console.log(`${appId} started: ${instanceId}`);
});
```

## Dev Tooling

The project uses a modern dev tooling stack with zero runtime dependencies:

- **Vite** — Build system and dev server with HMR. Auto-detects apps in `apps/*/`.
- **Vitest** — Test runner with happy-dom for DOM testing and fast-check for property-based tests.
- **ESLint v9** — Flat config with custom rule to detect `document.querySelector` usage in apps.
- **Prettier** — Consistent formatting for JS, CSS, and JSON.
- **TypeScript (checkJs)** — Type checking via JSDoc annotations without converting to .ts files. Type definitions in `core/types/`.

## Included Apps

| App | Description |
|-----|-------------|
| Terminal | Integrated terminal with CLI commands, history, autocomplete |
| Browser (theorb) | Web browser with tabs and bookmarks |
| Clock | Clock and calendar with multiple formats |
| System Info | CPU, memory, and browser information |
| Process Manager | Running apps list and instance control |
| File Manager | Virtual filesystem browser |
| Text Editor | Basic text editor |
| Taskbar | App launcher, active apps, system tray |
| About | System version information |

## Terminal Commands

```bash
browser --url https://example.com   # Open browser
clock --format 24h                  # Open clock
ps                                  # List processes
killall                             # Kill all apps
system-info --detailed              # Detailed system info
<app-name> --help                   # App help
```

## Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Follow the established patterns:
   - Use design system tokens
   - Integrate with SystemManager
   - Implement proper cleanup
   - Extend BaseApp for new apps
4. Commit your changes
5. Open a Pull Request

### Code Standards
- CSS: Use design tokens (`var(--color-text-primary)`)
- JavaScript: Extend `BaseApp` for apps, use `this.$()` for DOM access
- Systems: Register singletons in `SystemManager`
- Linting: `npm run lint` must pass with zero errors

## License

MIT License — see [LICENSE](LICENSE) for details.

## Author

**Maicon Slaviero**
- GitHub: [@MaiconSlavieiro](https://github.com/MaiconSlavieiro)
- Website: [reversodoavesso.online](https://reversodoavesso.online)
