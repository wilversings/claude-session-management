#!/usr/bin/env node
// Claude Code session management: pin (star), move, and delete sessions.
// Sessions live at ~/.claude/projects/<path-with-slashes-replaced-by-dashes>/<session-id>.jsonl
//
// Pinning writes a ⭐ into the session's own title so it shows up starred in
// Claude Code's /resume picker. It does this the same way /rename does: by
// appending a "custom-title" record to the .jsonl (the last such record wins).
// The file is NEVER renamed — /resume matches a session's filename against the
// "sessionId" recorded inside the file, so renaming breaks the lookup.
//
// Because the star lives inside the file, it travels automatically on `mv` and
// disappears on `rm` — there is no separate pin database to keep in sync.
//
// Single entry point: `claude-session <operation> [args...]`
//   claude-session list     [path]
//   claude-session projects
//   claude-session pin     <session-id-or-partial> [path]
//   claude-session unpin   <session-id-or-partial> [path]
//   claude-session mv      <session-id-or-partial> <from-path> <to-path>
//   claude-session rm      [-f|--force] <session-id-or-partial> [path]
//   claude-session rm -i   [path]        // interactive browse + delete (fzf)
//   claude-session export  <session-id-or-partial> [path] [-o out]
//   claude-session export  --project [path] [-o out] | --all [-o out]
//   claude-session import  <archive> [--to path] [-f]
//
// Node.js (>=14). No npm deps — the interactive delete additionally needs fzf,
// and export/import shell out to tar (or zip/unzip for .zip archives).
// Run it directly or symlink it onto your PATH as `claude-session`.
//
// This file is just the dispatcher; each operation lives in commands/<op>.js and
// shared helpers live in lib/common.js.

'use strict';

const { opList } = require('./commands/list');
const { opProjects } = require('./commands/projects');
const { opPin } = require('./commands/pin');
const { opUnpin } = require('./commands/unpin');
const { opMv } = require('./commands/mv');
const { opRm } = require('./commands/rm');
const { opRmUntitled } = require('./commands/rm-untitled');
const { opRmProject } = require('./commands/rm-project');
const { opExport } = require('./commands/export');
const { opImport } = require('./commands/import');
const { opHelp } = require('./commands/help');

function main(argv) {
    const cmd = argv[0];
    const rest = argv.slice(1);

    switch (cmd) {
        case 'list':
        case 'ls':
            return opList(rest);
        case 'projects':
        case 'proj':
            return opProjects();
        case 'pin':
            return opPin(rest);
        case 'unpin':
            return opUnpin(rest);
        case 'mv':
        case 'move':
            return opMv(rest);
        case 'rm':
        case 'delete':
        case 'remove':
            return opRm(rest);
        case 'rm-untitled':
        case 'clean-untitled':
            return opRmUntitled(rest);
        case 'rm-project':
            return opRmProject(rest);
        case 'export':
            return opExport(rest);
        case 'import':
            return opImport(rest);
        case undefined:
        case '':
        case 'help':
        case '-h':
        case '--help':
            return opHelp();
        default:
            console.error(`Unknown operation: ${cmd}`);
            console.error('');
            // help to stderr
            const orig = console.log;
            console.log = console.error;
            opHelp();
            console.log = orig;
            return 1;
    }
}

process.exit(main(process.argv.slice(2)));
