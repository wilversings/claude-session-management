// mv — move a Claude Code session from one project path to another.

'use strict';

const fs = require('fs');
const path = require('path');
const { projectDir, resolveSession } = require('../lib/common');

// Move a Claude Code session from one project path to another.
function opMv(args) {
    const [sessionId, fromPath, toPath] = args;
    if (!sessionId || !fromPath || !toPath) {
        console.log('Usage: claude-session mv <session-id-or-partial> <from-path> <to-path>');
        return 1;
    }

    const fromDir = projectDir(fromPath);
    const toDir = projectDir(toPath);
    const match = resolveSession(fromDir, sessionId);
    if (!match) return 1;

    fs.mkdirSync(toDir, { recursive: true });
    const base = path.basename(match);
    fs.renameSync(match, path.join(toDir, base));
    console.log(`Moved ${base}`);
    console.log(`  from: ${fromDir}`);
    console.log(`  to:   ${toDir}`);
    console.log("Note: entries inside the file still record the old 'cwd' — this affects display only, not the move.");
    return 0;
}

module.exports = { opMv };
