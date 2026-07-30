// mv-project — move every session for a project to another project path.

'use strict';

const fs = require('fs');
const path = require('path');
const { projectDir, projectCwd, listJsonl, isDir } = require('../lib/common');

// Move every session file from one project path to another in one shot.
// Unlike `mv`, this operates on the whole project directory at once.
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

    fs.mkdirSync(toDir, { recursive: true });
    for (const name of names) {
        fs.renameSync(path.join(fromDir, name), path.join(toDir, name));
    }

    // Clean up the source project directory if that emptied it out entirely.
    if (fs.readdirSync(fromDir).length === 0) {
        fs.rmdirSync(fromDir);
    }

    console.log(`Moved ${names.length} session${names.length === 1 ? '' : 's'}`);
    console.log(`  from: ${fromDir}  (${fromCwd})`);
    console.log(`  to:   ${toDir}`);
    console.log("Note: entries inside the files still record the old 'cwd' — this affects display only, not the move.");
    return 0;
}

module.exports = { opMvProject };
