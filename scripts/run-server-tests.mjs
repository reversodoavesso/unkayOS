#!/usr/bin/env node
/**
 * Cross-version runner for the server suite.
 *
 * Node 20 accepts a directory for `node --test`; Node 22 treats positional
 * arguments as glob patterns and no longer expands a bare directory, failing
 * with MODULE_NOT_FOUND. Listing the files keeps the same suite on both.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const directory = path.join('server', 'tests');
const files = readdirSync(directory)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join(directory, name));

if (files.length === 0) {
  console.error(`No server tests found in ${directory}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
