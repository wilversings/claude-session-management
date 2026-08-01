// rm — delete Claude Code sessions.
// (For an interactive fzf browser that deletes, use `claude-session -i`.)

'use strict';

const fs = require('fs');
const path = require('path');
const { projectDir, resolveSession, promptLine } = require('../lib/common');

// Delete a Claude Code session by id (or partial id).
function opRm(args) {
    let force = false;
    const positional = [];
    for (const a of args) {
        if (a === '-f' || a === '--force') force = true;
        else if (a === '-i' || a === '--interactive') continue; // handled by top-level -i
        else positional.push(a);
    }

    const sessionId = positional[0];
    const targetPath = positional[1] || process.cwd();
    if (!sessionId) {
        console.log('Usage: claude-session rm [-f|--force] <session-id-or-partial> [project-path]');
        console.log('       claude-session -i [project-path]   (interactive browse + delete/⭐)');
        return 1;
    }
    const dir = projectDir(targetPath);
    const match = resolveSession(dir, sessionId);
    if (!match) return 1;

    const base = path.basename(match);
    if (!force) {
        const confirm = promptLine(`Delete session ${base}? [y/N] `);
        if (!/^[Yy]/.test(confirm)) {
            console.log('Aborted.');
            return 1;
        }
    }

    fs.rmSync(match);
    console.log(`Deleted: ${base}`);
    return 0;
}

module.exports = { opRm };
