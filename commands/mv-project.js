// mv-project — move every session for a project to another project path.

'use strict';

const fs = require('fs');
const path = require('path');
const { projectDir, projectCwd, listJsonl, isDir, resolveCwd, rewriteCwd } = require('../lib/common');

// Move every session file from one project path to another in one shot.
// Unlike `mv`, this operates on the whole project directory at once.
//
// If <to-path> is already an existing project, this merges: the moved
// sessions are added alongside whatever sessions are already there, nothing
// existing is deleted. Only a literal filename collision would overwrite one
// file — practically impossible, since session filenames are Claude Code's
// own random UUIDs.
function opMvProject(args) {
    const [fromPath, toPath] = args;
    if (!fromPath || !toPath) {
        console.log('Usage: claude-session mv-project <from-path> <to-path>');
        return 1;
    }

    const fromDir = projectDir(fromPath);
    const names = isDir(fromDir) ? listJsonl(fromDir) : [];
    if (names.length === 0) {
        console.log(`No Claude Code sessions found for ${fromPath}`);
        return 1;
    }

    const fromCwd = projectCwd(fromDir);
    const toDir = projectDir(toPath);
    if (toDir === fromDir) {
        console.log('Source and destination resolve to the same project — nothing to do.');
        return 1;
    }

    // Prefer the cwd already recorded for the destination (if it's an existing
    // project) so we don't disagree with sessions already living there.
    const toHasSessions = isDir(toDir) && listJsonl(toDir).length > 0;
    const toCwd = toHasSessions ? projectCwd(toDir) : resolveCwd(toPath);

    fs.mkdirSync(toDir, { recursive: true });
    for (const name of names) {
        const dest = path.join(toDir, name);
        fs.renameSync(path.join(fromDir, name), dest);
        rewriteCwd(dest, fromCwd, toCwd);
    }

    // Clean up the source project directory if that emptied it out entirely.
    if (fs.readdirSync(fromDir).length === 0) {
        fs.rmdirSync(fromDir);
    }

    console.log(`Moved ${names.length} session${names.length === 1 ? '' : 's'}`);
    console.log(`  from: ${fromDir}  (${fromCwd})`);
    console.log(`  to:   ${toDir}  (${toCwd})`);
    return 0;
}

module.exports = { opMvProject };
