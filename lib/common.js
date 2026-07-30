// Shared helpers for claude-session commands: locating project dirs, reading
// session titles, appending custom-title records, and small filesystem/prompt
// utilities. Each command file under ../commands requires what it needs here.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const STAR = '⭐';
const projectsRoot = path.join(os.homedir(), '.claude', 'projects');

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

function isDir(p) {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

// The raw (JSON-escaped, unquoted) form of a string as it would appear inside
// a JSONL record — used to build regexes that match literal file content.
function jsonEscape(s) {
    return JSON.stringify(s).slice(1, -1);
}

// Resolve a path the same way `cwd` values are normally recorded: realpath
// when the path exists (resolving symlinks), otherwise a plain resolve.
function resolveCwd(p) {
    try {
        return fs.realpathSync(p);
    } catch {
        return path.resolve(p);
    }
}

// Read the first 'cwd' value recorded in a session file, decoded back to a
// real string (JSON escapes undone). Returns null if none is found.
function fileCwd(file) {
    const m = readText(file).match(/"cwd":"((?:[^"\\]|\\.)*)"/);
    return m ? JSON.parse(`"${m[1]}"`) : null;
}

// Rewrite every 'cwd' value in <file> that starts with <fromCwd> so it starts
// with <toCwd> instead (preserving any suffix, e.g. a subdirectory the
// session cd'ed into). Returns true if anything was changed.
function rewriteCwd(file, fromCwd, toCwd) {
    if (!fromCwd || fromCwd === toCwd) return false;
    const fromEsc = jsonEscape(fromCwd).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const toEsc = jsonEscape(toCwd);
    const re = new RegExp(`"cwd":"${fromEsc}((?:[^"\\\\]|\\\\.)*)"`, 'g');
    const content = readText(file);
    let changed = false;
    const updated = content.replace(re, (_match, suffix) => {
        changed = true;
        return `"cwd":"${toEsc}${suffix}"`;
    });
    if (changed) fs.writeFileSync(file, updated);
    return changed;
}

function hasCommand(cmd) {
    const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
    return !(r.error && r.error.code === 'ENOENT');
}

module.exports = {
    STAR,
    projectsRoot,
    encodePath,
    projectDir,
    readText,
    lastMatch,
    sessionTitle,
    setTitle,
    titleIsPinned,
    listJsonl,
    resolveSession,
    projectCwd,
    fmtMtime,
    promptLine,
    isDir,
    hasCommand,
    jsonEscape,
    resolveCwd,
    fileCwd,
    rewriteCwd,
};
