// rm-untitled — delete every untitled session (no custom or ai title), across
// all projects by default, or just one project if a path is given.

'use strict';

const fs = require('fs');
const path = require('path');
const { projectsRoot, projectDir, projectCwd, listJsonl, sessionTitle, fmtMtime, promptLine, isDir } = require('../lib/common');

// Untitled sessions in a single project dir, tagged with the project's cwd.
function collectUntitled(dir) {
    const cwd = projectCwd(dir);
    const rows = [];
    for (const name of listJsonl(dir)) {
        const full = path.join(dir, name);
        if (sessionTitle(full)) continue;
        rows.push({ file: full, id: name.replace(/\.jsonl$/, ''), project: cwd, mtime: fs.statSync(full).mtime });
    }
    return rows;
}

// Delete every untitled session. With a path, scoped to that project;
// otherwise scans every project. Always lists what it's about to delete and
// asks for one confirmation, unless -f/--force is given.
function opRmUntitled(args) {
    let force = false;
    const positional = [];
    for (const a of args) {
        if (a === '-f' || a === '--force') force = true;
        else positional.push(a);
    }
    const targetPath = positional[0];

    let rows = [];
    if (targetPath) {
        const dir = projectDir(targetPath);
        if (!isDir(dir)) {
            console.log(`No Claude Code sessions found for ${targetPath}`);
            return 1;
        }
        rows = collectUntitled(dir);
    } else {
        let names;
        try {
            names = fs.readdirSync(projectsRoot).sort();
        } catch {
            names = [];
        }
        for (const name of names) {
            const dir = path.join(projectsRoot, name);
            if (!isDir(dir) || listJsonl(dir).length === 0) continue;
            rows.push(...collectUntitled(dir));
        }
    }

    if (rows.length === 0) {
        console.log('No untitled sessions found');
        return 0;
    }

    rows.sort((a, b) => b.mtime - a.mtime); // newest first

    console.log(`About to permanently delete ${rows.length} untitled session${rows.length === 1 ? '' : 's'}:`);
    for (const r of rows) console.log(`  ${r.id}   ${r.project}   (modified ${fmtMtime(r.mtime)})`);

    if (!force) {
        const confirm = promptLine(`Delete all ${rows.length} untitled session(s)? [y/N] `);
        if (!/^[Yy]/.test(confirm)) {
            console.log('Aborted.');
            return 1;
        }
    }

    for (const r of rows) {
        fs.rmSync(r.file);
        console.log(`Deleted: ${r.id}`);
    }
    return 0;
}

module.exports = { opRmUntitled };
