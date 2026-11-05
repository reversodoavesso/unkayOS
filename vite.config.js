import { existsSync, readFileSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDeployment } from './core/host/config/deployment.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Modes produce actual runtime JSON: copied JS cannot rely on import.meta.env.
function deploymentConfigPlugin() {
  let deployment
  return {
    name: 'unkayos-runtime-deployment',
    configResolved(config) {
      if (['rda', 'standalone', 'sso'].includes(config.mode)) {
        deployment = createDeployment(config.mode)
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/config/deployment.json' || !deployment || existsSync(resolve(__dirname, 'public/config/deployment.json'))) return next()
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(deployment))
      })
    },
    closeBundle() {
      if (!deployment || existsSync(resolve(__dirname, 'public/config/deployment.json'))) return
      const destination = resolve(__dirname, 'dist/config')
      mkdirSync(destination, { recursive: true })
      writeFileSync(join(destination, 'deployment.json'), JSON.stringify(deployment, null, 2) + '\n')
    }
  }
}

/**
 * Plugin that serves app CSS and HTML as raw text instead of
 * letting Vite transform them into JS modules. The unkayOS runtime
 * loads these via fetch() and expects plain CSS/HTML.
 */
function serveAppsRawPlugin() {
  return {
    name: 'unkayos-serve-apps-raw',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/apps/') &&
            (req.url.endsWith('.css') || req.url.endsWith('.html'))) {
          const filePath = resolve(__dirname, req.url.slice(1))
          if (existsSync(filePath)) {
            const content = readFileSync(filePath, 'utf-8')
            const contentType = req.url.endsWith('.css') ? 'text/css' : 'text/html'
            res.setHeader('Content-Type', `${contentType}; charset=utf-8`)
            res.end(content)
            return
          }
        }
        next()
      })
    }
  }
}

/**
 * Plugin that copies all runtime assets to dist/ after build.
 *
 * unkayOS loads everything dynamically at runtime via fetch() and import().
 * The Vite bundler only processes the main index.html entry point.
 * All other files (core/, apps/, assets/, etc.) must be copied as-is
 * so that dynamic imports resolve to the same module identity.
 */
function copyRuntimeAssetsPlugin() {
  return {
    name: 'unkayos-copy-runtime-assets',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist')
      const dirs = ['apps', 'assets', 'auth', 'core', 'design-system']

      for (const dir of dirs) {
        const src = resolve(__dirname, dir)
        if (existsSync(src)) {
          cpSync(src, join(distDir, dir), { recursive: true })
        }
      }

      // Copy main.js (loaded via <script type="module"> in index.html)
      cpSync(resolve(__dirname, 'main.js'), join(distDir, 'main.js'))

      console.log('[unkayos] Runtime assets copied to dist/')
    }
  }
}

export default {
  root: '.',
  plugins: [serveAppsRawPlugin(), copyRuntimeAssetsPlugin(), deploymentConfigPlugin()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Only process index.html — don't bundle JS modules.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      // Treat all JS as external so Vite doesn't bundle them
      external: (id) => {
        if (id.endsWith('.css')) return false
        if (id.includes('main.js') || id.includes('/core/') || id.includes('/apps/')) return true
        return false
      }
    }
  },
  worker: {
    format: 'es'
  },
  appType: 'mpa',
  server: {
    proxy: {
      '/api/identity/me': { target: 'https://auth.reversodoavesso.com', changeOrigin: true, rewrite: () => '/api/auth/verify' },
      '/api/marketplace': { target: process.env.UNKAY_COMPUTE_URL || 'http://127.0.0.1:3005', changeOrigin: true },
      '/api/proxy': { target: process.env.UNKAY_COMPUTE_URL || 'http://127.0.0.1:3005', changeOrigin: true },
      '/api/reader': { target: process.env.UNKAY_COMPUTE_URL || 'http://127.0.0.1:3005', changeOrigin: true },
      '/api/runtime/v1/terminal': { target: process.env.UNKAY_COMPUTE_URL || 'http://127.0.0.1:3005', changeOrigin: true },
      '/ws/runtime/terminal': { target: process.env.UNKAY_COMPUTE_URL || 'http://127.0.0.1:3005', ws: true },
      '/api/compute/health': { target: process.env.UNKAY_COMPUTE_URL || 'http://127.0.0.1:3005', rewrite: () => '/health' },
      '/api/compute': { target: process.env.UNKAY_COMPUTE_URL || 'http://127.0.0.1:3005', changeOrigin: true },
      '/ws/terminal': { target: process.env.UNKAY_COMPUTE_URL || 'http://127.0.0.1:3005', ws: true },
      '/ws/browser': { target: process.env.UNKAY_COMPUTE_URL || 'http://127.0.0.1:3005', ws: true }
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless'
    }
  }
}
