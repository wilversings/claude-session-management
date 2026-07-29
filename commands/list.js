// list — show Claude Code sessions: no path lists every project grouped; a path
// lists just that project.

'use strict';

const fs = require('fs');
const path = require('path');
const { projectsRoot, projectDir, projectCwd, listJsonl, sessionTitle, fmtMtime, isDir } = require('../lib/common');

// Print one session per line for a project dir (optional indent prefix).
function listDir(dir, indent = '') {
    for (const name of listJsonl(dir)) {
        const full = path.join(dir, name);
        const base = name.replace(/\.jsonl$/, '');
        const mtime = fmtMtime(fs.statSync(full).mtime);
        const title = sessionTitle(full) || '(untitled)';
        console.log(`${indent}${base}   (modified ${mtime})   ${title}`);
    }
}

// List Claude Code sessions: no path = every project grouped; a path = just that
// project.
function opList(args) {
    const targetPath = args[0];

    // A path was given: list just that project (no group header).
    if (targetPath) {
        const dir = projectDir(targetPath);
        if (!isDir(dir)) {
            console.log(`No Claude Code sessions found for ${targetPath}`);
            return 1;
        }
        listDir(dir);
        return 0;
    }

    // No path: list every project, grouped, with the project path as a header.
    let projects;
    try {
        projects = fs.readdirSync(projectsRoot).sort();
    } catch {
        projects = [];
    }

    let any = false;
    let first = true;
    for (const name of projects) {
        const dir = path.join(projectsRoot, name);
        if (!isDir(dir) || listJsonl(dir).length === 0) continue;
        any = true;
        if (!first) console.log('');
        first = false;
        console.log(projectCwd(dir));
        listDir(dir, '  ');
    }

    if (!any) {
        console.log('No Claude Code sessions found');
        return 1;
    }
    return 0;
}

module.exports = { opList };
