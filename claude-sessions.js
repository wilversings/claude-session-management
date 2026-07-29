#!/usr/bin/env node
// Claude Code session management: pin (star), move, and delete sessions.
// Sessions live at ~/.claude/projects/<path-with-slashes-replaced-by-dashes>/<session-id>.jsonl
//
// Pinning writes a ⭐ into the session's own title so it shows up starred in
// Claude Code's /resume picker. It does this the same way /rename does: by
// appending a "custom-title" record to the .jsonl (the last such record wins).
// The file is NEVER renamed — /resume matches a session's filename against the
// "sessionId" recorded inside the file, so renaming breaks the lookup.
//
// Because the star lives inside the file, it travels automatically on `mv` and
// disappears on `rm` — there is no separate pin database to keep in sync.
//
// Single entry point: `claude-session <operation> [args...]`
//   claude-session list     [path]
//   claude-session projects
//   claude-session pin     <session-id-or-partial> [path]
//   claude-session unpin   <session-id-or-partial> [path]
//   claude-session mv      <session-id-or-partial> <from-path> <to-path>
//   claude-session rm      [-f|--force] <session-id-or-partial> [path]
//   claude-session rm -i   [path]        // interactive browse + delete (fzf)
//
// Node.js (>=14). No npm deps — the interactive delete additionally needs fzf.
// Run it directly or symlink it onto your PATH as `claude-session`.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const STAR = '⭐';
const projectsRoot = path.join(os.homedir(), '.claude', 'projects');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// Encode an absolute path the way Claude Code names its project dirs: every '/'
// becomes '-', and a '.' that begins a path segment (a hidden dir/file such as
// '.local') also becomes '-', so '/a/.b' -> '-a--b'. A '.' in the middle of a
// segment (e.g. 'tmp.XXXX') is kept. This is only used as a fallback for paths
// that have no project dir on disk yet — existing projects are matched by cwd.
function encodePath(abs) {
    return abs.replace(/\//g, '-').replace(/-\./g, '--');
}

// Resolve an absolute path to its Claude Code project directory.
//
// Claude's exact dir-name encoding has varied across versions, so we don't rely
// on reproducing it. Instead we reverse-map: find the existing project dir whose
// recorded 'cwd' matches this path (the same source `list` trusts). Only when no
// such dir exists (e.g. an `mv` destination) do we fall back to encoding a name.
function projectDir(p) {
    // Candidate absolute forms of the requested path. realpath resolves symlinks
    // (e.g. /home -> /var/home on Fedora atomic), which is how the cwd was
    // usually recorded; keep the plain resolve too in case it wasn't.
    const candidates = new Set();
    try {
        candidates.add(fs.realpathSync(p));
    } catch {
        // path may not exist (yet) — that's fine, resolve still gives a form.
    }
    candidates.add(path.resolve(p));

    let dirs;
    try {
        dirs = fs.readdirSync(projectsRoot);
    } catch {
        dirs = [];
    }
    for (const name of dirs) {
        const dir = path.join(projectsRoot, name);
        if (!isDir(dir) || listJsonl(dir).length === 0) continue;
        if (candidates.has(projectCwd(dir))) return dir;
    }

    // No existing project matched — fall back to an encoded name.
    const abs = [...candidates][0];
    return path.join(projectsRoot, encodePath(abs));
}

// Read a file as UTF-8, or '' if it can't be read.
function readText(file) {
    try {
        return fs.readFileSync(file, 'utf8');
    } catch {
        return '';
    }
}

// Return the capture group of the LAST match of a global regex, or null.
function lastMatch(content, re) {
    let m;
    let last = null;
    while ((m = re.exec(content)) !== null) last = m[1];
    return last;
}

// Get the title of a session file: a custom-title (/rename or pin) wins over the
// auto-generated ai-title. The last matching record in the file wins.
function sessionTitle(file) {
    const content = readText(file);
    const custom = lastMatch(content, /"type":"custom-title"[^}]*"customTitle":"([^"]*)"/g);
    if (custom) return custom;
    return lastMatch(content, /"type":"ai-title"[^}]*"aiTitle":"([^"]*)"/g) || '';
}

// Append a custom-title record (exactly like /rename) so the new title shows in
// /resume.
function setTitle(file, id, title) {
    // Claude Code reads the LAST custom-title record from the file. Each record
    // must be its own JSONL line, so guarantee the file ends in a newline before
    // appending — otherwise our object would glue onto the previous line and the
    // resulting line fails JSON.parse and is silently ignored by /resume.
    let stat;
    try {
        stat = fs.statSync(file);
    } catch {
        stat = null;
    }
    if (stat && stat.size > 0) {
        const buf = Buffer.alloc(1);
        const fd = fs.openSync(file, 'r');
        fs.readSync(fd, buf, 0, 1, stat.size - 1);
        fs.closeSync(fd);
        if (buf[0] !== 0x0a) fs.appendFileSync(file, '\n');
    }
    // JSON.stringify emits a correctly-escaped one-line JSON record (and keeps
    // ⭐ as a literal UTF-8 character, just like /rename does).
    const record = JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: id });
    fs.appendFileSync(file, record + '\n');
}

// True if a title string is starred.
function titleIsPinned(title) {
    return title.startsWith(STAR);
}

// List the .jsonl session files in a directory, sorted by name (shell-glob order).
function listJsonl(dir) {
    let names;
    try {
        names = fs.readdirSync(dir);
    } catch {
        return [];
    }
    return names.filter((n) => n.endsWith('.jsonl')).sort();
}

// Resolve a single session .jsonl from a partial id within <dir>.
// On success returns the matching file path.
// On no/many matches prints a diagnostic to stderr and returns null.
function resolveSession(dir, sessionId) {
    const needle = sessionId.toLowerCase();
    const matches = listJsonl(dir)
        .filter((n) => n.toLowerCase().includes(needle))
        .map((n) => path.join(dir, n));
    if (matches.length === 0) {
        console.error(`No session matching '${sessionId}' found in ${dir}`);
        return null;
    }
    if (matches.length > 1) {
        console.error('Multiple matches, be more specific:');
        for (const m of matches) console.error(m);
        return null;
    }
    return matches[0];
}

// Best-effort real project path for a project dir. The directory NAME is the
// source of truth for which project this is, but decoding it is ambiguous, so we
// read the 'cwd' from the sessions instead. A session moved in from another
// project keeps its old 'cwd', so we prefer the one whose encoding matches this
// dir's name (the authoritative cwd for this project) and only fall back to an
// arbitrary cwd, then the raw dir name, when none matches.
function projectCwd(dir) {
    const base = path.basename(dir);
    let fallback = null;
    for (const name of listJsonl(dir)) {
        const m = readText(path.join(dir, name)).match(/"cwd":"([^"]*)"/);
        if (!m) continue;
        if (fallback === null) fallback = m[1];
        if (encodePath(m[1]) === base) return m[1];
    }
    return fallback !== null ? fallback : base;
}

// Format a Date as 'YYYY-MM-DD HH:MM' in local time.
function fmtMtime(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

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

// Read a single line synchronously from stdin (fd 0), for confirm prompts.
function promptLine(question) {
    process.stdout.write(question);
    const buf = Buffer.alloc(1);
    let s = '';
    while (true) {
        let n;
        try {
            n = fs.readSync(0, buf, 0, 1, null);
        } catch (e) {
            if (e.code === 'EAGAIN') continue; // stdin momentarily unavailable
            if (e.code === 'EOF') break;
            throw e;
        }
        if (n === 0) break;
        const ch = buf.toString('utf8');
        if (ch === '\n') break;
        s += ch;
    }
    return s;
}

// ---------------------------------------------------------------------------
// operations
// ---------------------------------------------------------------------------

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

// Pin a session: prepend ⭐ to its title so /resume shows it starred.
function opPin(args) {
    const sessionId = args[0];
    const targetPath = args[1] || process.cwd();
    if (!sessionId) {
        console.log('Usage: claude-session pin <session-id-or-partial> [project-path]');
        return 1;
    }
    const dir = projectDir(targetPath);
    const match = resolveSession(dir, sessionId);
    if (!match) return 1;

    const id = path.basename(match, '.jsonl');
    const title = sessionTitle(match);
    if (titleIsPinned(title)) {
        console.log(`Already pinned: ${id}`);
        return 1;
    }

    const newTitle = title ? `${STAR} ${title}` : STAR;
    setTitle(match, id, newTitle);
    console.log(`Pinned: ${id}`);
    console.log(`  title: ${newTitle}`);
    return 0;
}

// Unpin a session: strip the leading ⭐ from its title.
function opUnpin(args) {
    const sessionId = args[0];
    const targetPath = args[1] || process.cwd();
    if (!sessionId) {
        console.log('Usage: claude-session unpin <session-id-or-partial> [project-path]');
        return 1;
    }
    const dir = projectDir(targetPath);
    const match = resolveSession(dir, sessionId);
    if (!match) return 1;

    const id = path.basename(match, '.jsonl');
    const title = sessionTitle(match);
    if (!titleIsPinned(title)) {
        console.log(`Not pinned: ${id}`);
        return 1;
    }

    const newTitle = title.replace(/^⭐\s*/, '');
    setTitle(match, id, newTitle);
    console.log(`Unpinned: ${id}`);
    console.log(`  title: ${newTitle}`);
    return 0;
}

// Move a Claude Code session from one project path to another.
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

    fs.mkdirSync(toDir, { recursive: true });
    const base = path.basename(match);
    fs.renameSync(match, path.join(toDir, base));
    console.log(`Moved ${base}`);
    console.log(`  from: ${fromDir}`);
    console.log(`  to:   ${toDir}`);
    console.log("Note: entries inside the file still record the old 'cwd' — this affects display only, not the move.");
    return 0;
}

// Delete Claude Code sessions (add -i for an interactive fzf browser).
function opRm(args) {
    let force = false;
    let interactive = false;
    const positional = [];
    for (const a of args) {
        if (a === '-f' || a === '--force') force = true;
        else if (a === '-i' || a === '--interactive') interactive = true;
        else positional.push(a);
    }

    if (interactive) return rmInteractive(positional[0]);

    const sessionId = positional[0];
    const targetPath = positional[1] || process.cwd();
    if (!sessionId) {
        console.log('Usage: claude-session rm [-f|--force] <session-id-or-partial> [project-path]');
        console.log('       claude-session rm -i [project-path]   (interactive)');
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

// Interactively browse and delete Claude Code sessions (arrow keys + fzf),
// newest first.
function rmInteractive(targetPathArg) {
    if (!hasCommand('fzf')) {
        console.log('This requires fzf (https://github.com/junegunn/fzf). Install it and try again.');
        return 1;
    }

    const targetPath = targetPathArg || process.cwd();
    const dir = projectDir(targetPath);
    if (!isDir(dir)) {
        console.log(`No Claude Code sessions found for ${targetPath}`);
        return 1;
    }

    while (true) {
        const names = listJsonl(dir);
        if (names.length === 0) {
            console.log(`No sessions left in ${dir}`);
            break;
        }

        // fields: id (hidden) \t modified \t title
        const items = names.map((name) => {
            const full = path.join(dir, name);
            const st = fs.statSync(full);
            return {
                id: name.replace(/\.jsonl$/, ''),
                epoch: st.mtimeMs,
                mtime: fmtMtime(st.mtime),
                title: sessionTitle(full) || '(untitled)',
            };
        });
        items.sort((a, b) => b.epoch - a.epoch); // newest first

        const input = items.map((it) => `${it.id}\t${it.mtime}\t${it.title}`).join('\n');
        const res = spawnSync(
            'fzf',
            [
                '--delimiter=\t',
                '--with-nth=2,3',
                '--multi',
                '--height=60%',
                '--border',
                '--reverse',
                '--header',
                'arrows/j-k: move · tab: multi-select · enter: delete batch · esc: quit',
            ],
            { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }
        );

        const selected = (res.stdout || '').split('\n').filter((l) => l.length > 0);
        if (selected.length === 0) break;

        const toDelete = selected.map((l) => {
            const [id, mtime, title] = l.split('\t');
            return { id, mtime, title };
        });

        console.log('About to permanently delete:');
        for (const d of toDelete) console.log(`  ${d.title}  (modified ${d.mtime})`);

        const confirm = promptLine(`Confirm delete of ${toDelete.length} session(s)? [y/N] `);
        if (!/^[Yy]/.test(confirm)) {
            console.log('Aborted this batch.');
            continue;
        }

        for (const d of toDelete) {
            fs.rmSync(path.join(dir, `${d.id}.jsonl`));
            console.log(`Deleted: ${d.id}.jsonl`);
        }
    }
    return 0;
}

function opHelp() {
    console.log('Manage Claude Code sessions: pin, move, and delete.');
    console.log('');
    console.log('Usage: claude-session <operation> [args...]');
    console.log('');
    console.log('Operations:');
    console.log('  list  [path]                              List sessions; no path = all projects grouped');
    console.log('  projects                                  List all projects with session counts');
    console.log('  pin   <session-id-or-partial> [path]      Star a session (shows ⭐ in /resume)');
    console.log("  unpin <session-id-or-partial> [path]      Remove a session's star");
    console.log('  mv    <session-id-or-partial> <from> <to> Move a session between project paths');
    console.log('  rm    [-f|--force] <id-or-partial> [path] Delete a session');
    console.log('  rm    -i [path]                           Interactively browse + delete (fzf)');
    console.log('');
    console.log('Aliases: ls=list, proj=projects, move=mv, delete/remove=rm, help/-h/--help');
    return 0;
}

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

function isDir(p) {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

function hasCommand(cmd) {
    const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    return !(r.error && r.error.code === 'ENOENT');
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

function main(argv) {
    const cmd = argv[0];
    const rest = argv.slice(1);

    switch (cmd) {
        case 'list':
        case 'ls':
            return opList(rest);
        case 'projects':
        case 'proj':
            return opProjects();
        case 'pin':
            return opPin(rest);
        case 'unpin':
            return opUnpin(rest);
        case 'mv':
        case 'move':
            return opMv(rest);
        case 'rm':
        case 'delete':
        case 'remove':
            return opRm(rest);
        case undefined:
        case '':
        case 'help':
        case '-h':
        case '--help':
            return opHelp();
        default:
            console.error(`Unknown operation: ${cmd}`);
            console.error('');
            // help to stderr
            const orig = console.log;
            console.log = console.error;
            opHelp();
            console.log = orig;
            return 1;
    }
}

process.exit(main(process.argv.slice(2)));
