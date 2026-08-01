'use strict';
// Install (or remove) the man page for a GLOBAL install.
//
// Modern npm no longer links man pages from package.json's `man` field, so we
// do it ourselves: on `npm install -g` we copy claude-session.1 into the npm
// prefix's share/man/man1. `man` finds it automatically because that prefix's
// bin dir is already on PATH (it's where the `claude-session` command lands),
// and `man` derives its search path from PATH — so no MANPATH setup is needed,
// and it works the same for a system prefix or an nvm-style one.
//
// This runs only for global installs; a local (dependency) install is a no-op,
// so we never touch a project's or the system's man directories then. It is
// strictly best-effort: any error is swallowed so it can never break an
// install or uninstall.

const fs = require('fs');
const path = require('path');

// The npm prefix's man1 directory. This file ships at
// <prefix>/lib/node_modules/<pkg>/scripts/manpage.js, so the prefix is four
// levels up; prefer npm's own prefix env var when it's an absolute path.
function man1Dir() {
    const envPrefix = process.env.npm_config_prefix;
    const prefix = envPrefix && path.isAbsolute(envPrefix)
        ? envPrefix
        : path.resolve(__dirname, '..', '..', '..', '..');
    return path.join(prefix, 'share', 'man', 'man1');
}

function run() {
    if (process.env.npm_config_global !== 'true') return; // global installs only

    const dest = path.join(man1Dir(), 'claude-session.1');

    if (process.argv[2] === 'uninstall') {
        fs.rmSync(dest, { force: true });
        return;
    }

    const src = path.join(__dirname, '..', 'man', 'claude-session.1');
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

try {
    run();
} catch {
    // best-effort — never fail the npm lifecycle over a man page
}
