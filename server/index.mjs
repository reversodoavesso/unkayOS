// server/index.mjs
// Entry point: node server/index.mjs --config=/etc/unkayos/server.json

import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { loadServerConfig, ServerConfigError } from './config.mjs';
import { createPolicy } from './policy.mjs';
import { createGateway } from './app.mjs';

/** @param {string[]} argv */
function readConfigPath(argv) {
    const flag = argv.find(argument => argument.startsWith('--config='));
    if (flag) return flag.slice('--config='.length);
    return process.env.UNKAYOS_SERVER_CONFIG || '';
}

/** @param {string[]} argv */
function readStaticRoot(argv) {
    const flag = argv.find(argument => argument.startsWith('--static='));
    if (flag) return resolve(flag.slice('--static='.length));
    return process.env.UNKAYOS_STATIC_ROOT ? resolve(process.env.UNKAYOS_STATIC_ROOT) : null;
}

async function main() {
    const configPath = readConfigPath(process.argv.slice(2));
    if (!configPath) {
        console.error('[gateway] Informe --config=<server.json> ou UNKAYOS_SERVER_CONFIG.');
        process.exitCode = 2;
        return;
    }
    let loaded;
    try {
        loaded = await loadServerConfig({ configPath });
    } catch (error) {
        const code = error instanceof ServerConfigError ? error.code : 'CONFIG_ERROR';
        console.error(`[gateway] ${code}: ${error.message}`);
        process.exitCode = 1;
        return;
    }
    const policy = createPolicy(loaded.policy);
    const staticRoot = readStaticRoot(process.argv.slice(2));
    const gateway = createGateway({ config: loaded.config, policy, secrets: loaded.secrets, staticRoot });
    const listen = loaded.config.listen || { host: '127.0.0.1', port: 8080 };
    const server = createServer(gateway.handler);
    server.listen(listen.port, listen.host, () => {
        // Only public identifiers are logged.
        console.log(`[gateway] unkayOS gateway em http://${listen.host}:${listen.port} (instalação ${loaded.config.installationId}, revisão ${loaded.config.revision}, política ${policy.version}${staticRoot ? `, estático ${staticRoot}` : ''})`);
    });
    const shutdown = () => {
        server.close(() => {
            gateway.close();
            process.exit(0);
        });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main();
