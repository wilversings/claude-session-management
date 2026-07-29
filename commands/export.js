// export — bundle sessions into a portable .tar.gz (or .zip) archive with a
// manifest so `import` can restore them into the right projects.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { projectsRoot, projectDir, projectCwd, listJsonl, sessionTitle, resolveSession, isDir, hasCommand } = require('../lib/common');

// A filesystem-safe timestamp 'YYYYMMDD-HHMMSS' for default export filenames.
function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Collect the sessions to export as {file, id, cwd, title}. `mode` is one of:
//   'one'     — a single session (opts.sessionId) within a project (opts.path)
//   'project' — every session in one project (opts.path)
//   'all'     — every session across every project
// Returns an array (possibly empty), or null if a single-session lookup failed
// (resolveSession already printed the diagnostic in that case).
function collectSessions(mode, opts) {
    const out = [];
    const push = (dir, name) => {
        const full = path.join(dir, name);
        out.push({
            file: full,
            id: name.replace(/\.jsonl$/, ''),
            cwd: projectCwd(dir),
            title: sessionTitle(full),
        });
    };

    if (mode === 'all') {
        let names;
        try {
            names = fs.readdirSync(projectsRoot).sort();
        } catch {
            names = [];
        }
        for (const n of names) {
            const dir = path.join(projectsRoot, n);
            if (!isDir(dir)) continue;
            for (const f of listJsonl(dir)) push(dir, f);
        }
        return out;
    }

    const dir = projectDir(opts.path || process.cwd());
    if (!isDir(dir)) return out;

    if (mode === 'project') {
        for (const f of listJsonl(dir)) push(dir, f);
        return out;
    }

    // 'one'
    const match = resolveSession(dir, opts.sessionId);
    if (!match) return null;
    push(dir, path.basename(match));
    return out;
}

// Bundle sessions into a portable archive. The archive holds a manifest.json
// (recording each session's cwd so import can place it in the right project) and
// the raw .jsonl files under sessions/. Format is chosen by the output name:
// '.zip' uses the system `zip`, anything else (default .tar.gz) uses `tar`.
function opExport(args) {
    let output = null;
    let all = false;
    let project = false;
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-o' || a === '--output') output = args[++i];
        else if (a === '--all') all = true;
        else if (a === '--project' || a === '-p') project = true;
        else positional.push(a);
    }

    let sessions;
    if (all) {
        sessions = collectSessions('all', {});
    } else if (project) {
        sessions = collectSessions('project', { path: positional[0] });
    } else {
        const sessionId = positional[0];
        if (!sessionId) {
            console.log('Usage: claude-session export <id-or-partial> [path] [-o out.tar.gz]');
            console.log('       claude-session export --project [path] [-o out.tar.gz]');
            console.log('       claude-session export --all [-o out.tar.gz]');
            return 1;
        }
        sessions = collectSessions('one', { sessionId, path: positional[1] });
    }

    if (sessions === null) return 1; // resolveSession already complained
    if (sessions.length === 0) {
        console.error('No sessions to export.');
        return 1;
    }

    if (!output) output = `claude-sessions-${stamp()}.tar.gz`;
    const outAbs = path.resolve(output);
    const zip = /\.zip$/i.test(outAbs);
    const tool = zip ? 'zip' : 'tar';
    if (!hasCommand(tool)) {
        console.error(`This needs '${tool}' on PATH to write ${zip ? 'a .zip' : 'a .tar.gz'} archive.`);
        return 1;
    }

    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-session-export-'));
    try {
        const manifest = {
            tool: 'claude-session',
            format: 1,
            exportedAt: new Date().toISOString(),
            sessions: sessions.map((s) => ({
                sessionId: s.id,
                file: `sessions/${s.id}.jsonl`,
                cwd: s.cwd,
                title: s.title,
            })),
        };
        const sessDir = path.join(staging, 'sessions');
        fs.mkdirSync(sessDir);
        for (const s of sessions) fs.copyFileSync(s.file, path.join(sessDir, `${s.id}.jsonl`));
        fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

        // zip appends to an existing file; start clean so re-exports don't accrete.
        try {
            fs.rmSync(outAbs);
        } catch {
            // nothing to remove — fine.
        }

        const r = zip
            ? spawnSync('zip', ['-r', '-q', outAbs, 'manifest.json', 'sessions'], { cwd: staging, stdio: 'inherit' })
            : spawnSync('tar', ['-czf', outAbs, '-C', staging, 'manifest.json', 'sessions'], { stdio: 'inherit' });
        if (r.status !== 0) {
            console.error(`Archiving failed (${tool} exited ${r.status}).`);
            return 1;
        }
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }

    console.log(`Exported ${sessions.length} session(s) to ${outAbs}`);
    return 0;
}

module.exports = { opExport };
