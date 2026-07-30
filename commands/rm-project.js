// rm-project — delete every session for a project, and the project itself.

'use strict';

const fs = require('fs');
const path = require('path');
const { projectDir, projectCwd, listJsonl, sessionTitle, fmtMtime, promptLine, isDir } = require('../lib/common');

// Delete a whole project: every session file plus the project directory
// itself. Lists what it's about to delete and asks for one confirmation,
// unless -f/--force is given.
function opRmProject(args) {
    let force = false;
    const positional = [];
    for (const a of args) {
        if (a === '-f' || a === '--force') force = true;
        else positional.push(a);
    }

    const targetPath = positional[0] || process.cwd();
    const dir = projectDir(targetPath);
    if (!isDir(dir)) {
        console.log(`No Claude Code sessions found for ${targetPath}`);
        return 1;
    }

    const names = listJsonl(dir);
    const cwd = projectCwd(dir);
    const rows = names.map((name) => {
        const full = path.join(dir, name);
        return {
            id: name.replace(/\.jsonl$/, ''),
            title: sessionTitle(full) || '(untitled)',
            mtime: fs.statSync(full).mtime,
        };
    });
    rows.sort((a, b) => b.mtime - a.mtime); // newest first

    console.log(`About to permanently delete project ${cwd}`);
    console.log(`(${rows.length} session${rows.length === 1 ? '' : 's'}):`);
    for (const r of rows) console.log(`  ${r.id}   (modified ${fmtMtime(r.mtime)})   ${r.title}`);

    if (!force) {
        const confirm = promptLine(`Delete project ${cwd} and all its sessions? [y/N] `);
        if (!/^[Yy]/.test(confirm)) {
            console.log('Aborted.');
            return 1;
        }
    }

    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Deleted project: ${cwd}`);
    return 0;
}

module.exports = { opRmProject };
