// projects — list all projects that have Claude Code sessions, with counts.

'use strict';

const fs = require('fs');
const path = require('path');
const { projectsRoot, projectCwd, listJsonl, isDir } = require('../lib/common');

// List all projects that have Claude Code sessions, one per line, with a count
// of how many sessions each holds. Sorted by project path.
function opProjects() {
    let names;
    try {
        names = fs.readdirSync(projectsRoot).sort();
    } catch {
        names = [];
    }

    const rows = [];
    for (const name of names) {
        const dir = path.join(projectsRoot, name);
        if (!isDir(dir)) continue;
        const count = listJsonl(dir).length;
        if (count === 0) continue;
        rows.push({ cwd: projectCwd(dir), count });
    }

    if (rows.length === 0) {
        console.log('No Claude Code projects found');
        return 1;
    }

    rows.sort((a, b) => a.cwd.localeCompare(b.cwd));
    for (const r of rows) {
        const label = r.count === 1 ? 'session' : 'sessions';
        console.log(`${r.cwd}   (${r.count} ${label})`);
    }
    return 0;
}

module.exports = { opProjects };
