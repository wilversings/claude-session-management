// mv — move a Claude Code session from one project path to another.

'use strict';

const fs = require('fs');
const path = require('path');
const { projectDir, resolveSession, projectCwd, listJsonl, isDir, resolveCwd, fileCwd, rewriteCwd } = require('../lib/common');

// Move a Claude Code session from one project path to another.
//
// If <to-path> is already an existing project, the session is added
// alongside its existing sessions (merge), not an overwrite of the project.
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

    const fromCwd = fileCwd(match);
    const toHasSessions = isDir(toDir) && listJsonl(toDir).length > 0;
    const toCwd = toHasSessions ? projectCwd(toDir) : resolveCwd(toPath);

    fs.mkdirSync(toDir, { recursive: true });
    const base = path.basename(match);
    const dest = path.join(toDir, base);
    fs.renameSync(match, dest);
    rewriteCwd(dest, fromCwd, toCwd);

    console.log(`Moved ${base}`);
    console.log(`  from: ${fromDir}`);
    console.log(`  to:   ${toDir}  (${toCwd})`);
    return 0;
}

module.exports = { opMv };
