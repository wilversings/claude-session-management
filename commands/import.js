// import — restore sessions from an archive produced by `export`.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { projectDir, hasCommand } = require('../lib/common');

// Import sessions from an archive produced by `export`. Each session is placed
// into the project dir for its recorded cwd (or --to <path> to force them all
// into one project). The .jsonl keeps its original basename (= sessionId), which
// /resume relies on — see invariant #1. Existing sessions are skipped unless -f.
function opImport(args) {
    let force = false;
    let to = null;
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-f' || a === '--force') force = true;
        else if (a === '--to') to = args[++i];
        else positional.push(a);
    }

    const archive = positional[0];
    if (!archive) {
        console.log('Usage: claude-session import <archive.tar.gz|.zip> [--to path] [-f]');
        return 1;
    }
    const archAbs = path.resolve(archive);
    if (!fs.existsSync(archAbs)) {
        console.error(`Archive not found: ${archive}`);
        return 1;
    }
    const zip = /\.zip$/i.test(archAbs);
    const tool = zip ? 'unzip' : 'tar';
    if (!hasCommand(tool)) {
        console.error(`This needs '${tool}' on PATH to read ${zip ? 'a .zip' : 'a .tar.gz'} archive.`);
        return 1;
    }

    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-session-import-'));
    try {
        const r = zip
            ? spawnSync('unzip', ['-q', '-o', archAbs, '-d', staging], { stdio: 'inherit' })
            : spawnSync('tar', ['-xzf', archAbs, '-C', staging], { stdio: 'inherit' });
        if (r.status !== 0) {
            console.error(`Extraction failed (${tool} exited ${r.status}).`);
            return 1;
        }

        let manifest;
        try {
            manifest = JSON.parse(fs.readFileSync(path.join(staging, 'manifest.json'), 'utf8'));
        } catch {
            console.error('Archive has no valid manifest.json — not a claude-session export.');
            return 1;
        }
        const entries = Array.isArray(manifest.sessions) ? manifest.sessions : [];
        if (entries.length === 0) {
            console.error('Archive lists no sessions.');
            return 1;
        }

        let imported = 0;
        let skipped = 0;
        for (const e of entries) {
            const src = path.join(staging, e.file || `sessions/${e.sessionId}.jsonl`);
            if (!e.sessionId || !fs.existsSync(src)) {
                console.error(`  missing in archive, skipping: ${e.sessionId || '(no id)'}`);
                skipped++;
                continue;
            }
            const destDir = projectDir(to || e.cwd || process.cwd());
            fs.mkdirSync(destDir, { recursive: true });
            const dest = path.join(destDir, `${e.sessionId}.jsonl`);
            if (fs.existsSync(dest) && !force) {
                console.log(`  exists, skipping (use -f to overwrite): ${e.sessionId}`);
                skipped++;
                continue;
            }
            fs.copyFileSync(src, dest);
            imported++;
            console.log(`  imported ${e.sessionId}  ->  ${destDir}`);
        }
        console.log(`Imported ${imported} session(s)${skipped ? `, skipped ${skipped}` : ''}.`);
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }
    return 0;
}

module.exports = { opImport };
