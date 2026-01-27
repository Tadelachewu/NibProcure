#!/usr/bin/env node
const { spawnSync } = require('child_process');

if (process.env.NODE_ENV === 'production') {
    console.error('Playwright tests are dev-only. Set NODE_ENV!=production to run.');
    process.exit(0);
}

const args = process.argv.slice(2);
const res = spawnSync('npx', ['playwright', ...args], { stdio: 'inherit' });
process.exit(res.status);
