// project — manage whole projects: list them, move one, delete one, or export.
//
// A thin dispatcher over four subcommands:
//   project ls                  list every project with its session count
//   project mv <from> <to>      move a whole project's sessions to another path
//   project rm [-f] [path]      delete a whole project and all its sessions
//   project export [path] [-o]  bundle a whole project into a portable archive

'use strict';

const fs = require('fs');
const path = require('path');
const {
    projectsRoot,
    projectDir,
    projectCwd,
    listJsonl,
    isDir,
    resolveCwd,
    rewriteCwd,
    sessionTitle,
    fmtMtime,
    promptLine,
} = require('../lib/common');
const { opProjectExport } = require('./export');

// project ls — list all projects that have Claude Code sessions, one per line,
// with a count of how many sessions each holds. Sorted by project path.
function projectLs() {
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

// Ask how to resolve a filename collision during `project mv`, looping until a
// recognized answer. Returns one of 'overwrite' | 'overwrite-all' | 'skip' |
// 'skip-all'. An empty line (a bare Enter, or a non-interactive stdin at EOF)
// takes the safe default — skip this one — so we never loop forever off a TTY.
function promptConflict(name) {
    while (true) {
        const ans = promptLine(
            `Session ${name} already exists at the destination — ` +
            `[o]verwrite, overwrite [a]ll, [s]kip, skip a[l]l? [s] `
        ).trim().toLowerCase();
        switch (ans) {
            case 'o': return 'overwrite';
            case 'a': return 'overwrite-all';
            case '': // bare Enter or EOF → safe default
            case 's': return 'skip';
            case 'l': return 'skip-all';
            default: console.log("Please answer 'o', 'a', 's', or 'l'.");
        }
    }
}

// project mv — move every session file from one project path to another in one
// shot. Unlike `mv`, this operates on the whole project directory at once.
//
// If <to-path> is already an existing project, this merges: the moved sessions
// are added alongside whatever sessions are already there, nothing existing is
// deleted. A literal filename collision (practically impossible, since session
// filenames are Claude Code's own random UUIDs) would overwrite one file, so we
// stop and ask per collision — overwrite / overwrite-all / skip / skip-all —
// unless -f/--force is given, which overwrites every collision without asking.
function projectMv(args) {
    let force = false;
    const positional = [];
    for (const a of args) {
        if (a === '-f' || a === '--force') force = true;
        else positional.push(a);
    }

    const [fromPath, toPath] = positional;
    if (!fromPath || !toPath) {
        console.log('Usage: claude-session project mv [-f|--force] <from-path> <to-path>');
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
    let overwriteAll = force;
    let skipAll = false;
    let moved = 0;
    let skipped = 0;
    for (const name of names) {
        const dest = path.join(toDir, name);
        if (fs.existsSync(dest)) {
            let action;
            if (overwriteAll) action = 'overwrite';
            else if (skipAll) action = 'skip';
            else {
                action = promptConflict(name);
                if (action === 'overwrite-all') { overwriteAll = true; action = 'overwrite'; }
                else if (action === 'skip-all') { skipAll = true; action = 'skip'; }
            }
            if (action === 'skip') { skipped++; continue; } // leave the source file where it is
        }
        fs.renameSync(path.join(fromDir, name), dest);
        rewriteCwd(dest, fromCwd, toCwd);
        moved++;
    }

    // Clean up the source project directory if that emptied it out entirely.
    if (fs.readdirSync(fromDir).length === 0) {
        fs.rmdirSync(fromDir);
    }

    console.log(`Moved ${moved} session${moved === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}`);
    console.log(`  from: ${fromDir}  (${fromCwd})`);
    console.log(`  to:   ${toDir}  (${toCwd})`);
    return 0;
}

// project rm — delete a whole project: every session file plus the project
// directory itself. Lists what it's about to delete and asks for one
// confirmation, unless -f/--force is given.
function projectRm(args) {
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

// Dispatch `project <sub> [args...]` to the matching subcommand.
function opProject(args) {
    const sub = args[0];
    const rest = args.slice(1);
    switch (sub) {
        case 'ls':
        case 'list':
            return projectLs();
        case 'mv':
        case 'move':
            return projectMv(rest);
        case 'rm':
        case 'delete':
        case 'remove':
            return projectRm(rest);
        case 'export':
            return opProjectExport(rest);
        case undefined:
        case '':
            console.error('Usage: claude-session project <ls|mv|rm|export> [args...]');
            return 1;
        default:
            console.error(`Unknown project subcommand: ${sub}`);
            console.error('Usage: claude-session project <ls|mv|rm|export> [args...]');
            return 1;
    }
}

module.exports = { opProject };
