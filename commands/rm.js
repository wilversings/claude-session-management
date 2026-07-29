// rm — delete Claude Code sessions (add -i for an interactive fzf browser).

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { projectDir, resolveSession, listJsonl, sessionTitle, fmtMtime, promptLine, isDir, hasCommand } = require('../lib/common');

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

module.exports = { opRm };
