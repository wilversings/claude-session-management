// star — prepend ⭐ to a session's title so /resume shows it starred
// (add -i for an interactive fzf browser that toggles stars).

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    projectDir,
    resolveSession,
    listJsonl,
    sessionTitle,
    setTitle,
    titleIsStarred,
    starTitle,
    unstarTitle,
    fmtMtime,
    isDir,
    hasCommand,
} = require('../lib/common');

// Star a session: prepend ⭐ to its title so /resume shows it starred.
function opStar(args) {
    let interactive = false;
    const positional = [];
    for (const a of args) {
        if (a === '-i' || a === '--interactive') interactive = true;
        else positional.push(a);
    }

    if (interactive) return starInteractive(positional[0]);

    const sessionId = positional[0];
    const targetPath = positional[1] || process.cwd();
    if (!sessionId) {
        console.log('Usage: claude-session star <session-id-or-partial> [project-path]');
        console.log('       claude-session star -i [project-path]   (interactive)');
        return 1;
    }
    const dir = projectDir(targetPath);
    const match = resolveSession(dir, sessionId);
    if (!match) return 1;

    const id = path.basename(match, '.jsonl');
    const title = sessionTitle(match);
    if (titleIsStarred(title)) {
        console.log(`Already starred: ${id}`);
        return 1;
    }

    const newTitle = starTitle(title);
    setTitle(match, id, newTitle);
    console.log(`Starred: ${id}`);
    console.log(`  title: ${newTitle}`);
    return 0;
}

// Interactively browse sessions and toggle their stars (arrow keys + fzf),
// newest first. Enter toggles the star on every selected session and then
// reopens the list with the same query, so any number of sessions can be
// toggled any number of times; esc or q quits.
function starInteractive(targetPathArg) {
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

    const quitBind = qQuitBind();
    let query = ''; // carried across iterations so the list reopens where it was

    while (true) {
        const names = listJsonl(dir);
        if (names.length === 0) {
            console.log(`No sessions in ${dir}`);
            break;
        }

        // fields: id (hidden) \t modified \t title (already carries the ⭐)
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
                '--print-query',
                `--query=${query}`,
                '--bind',
                quitBind,
                '--header',
                'arrows/j-k: move · tab: multi-select · enter: toggle ⭐ · q/esc: quit',
            ],
            { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }
        );

        if (res.error) {
            console.error(`Could not run fzf: ${res.error.message}`);
            return 1;
        }

        // --print-query puts the search box's contents on the first line,
        // ahead of the selection (and prints it on abort too).
        const lines = (res.stdout || '').split('\n');
        query = lines[0] || '';
        // 0 = selected, 1 = enter with no match, 130 = esc/q/ctrl-c, else error.
        if (res.status !== 0 && res.status !== 1) break;

        const selected = lines.slice(1).filter((l) => l.length > 0);
        for (const line of selected) {
            const id = line.split('\t')[0];
            toggleStar(path.join(dir, `${id}.jsonl`), id);
        }
    }
    return 0;
}

// Flip one session's star and report what happened.
function toggleStar(file, id) {
    const title = sessionTitle(file);
    const starred = titleIsStarred(title);
    const newTitle = starred ? unstarTitle(title) : starTitle(title);
    setTitle(file, id, newTitle);
    console.log(`${starred ? 'Unstarred' : 'Starred'}: ${id}   ${newTitle || '(untitled)'}`);
}

// The fzf binding that makes `q` quit. Recent fzf exports $FZF_QUERY to the
// commands it spawns, so there `q` can quit only while the search box is empty
// and stay typeable inside a query. Older fzf rejects the `transform` action
// outright (and versions between the two leave $FZF_QUERY unset, which reads as
// an empty query), so `q` simply always quits there.
//
// Support is probed, not guessed from a version number: --filter runs fzf
// non-interactively but still parses --bind, and it exits 2 on an unknown action.
function qQuitBind() {
    const smart = 'q:transform:[ -z "$FZF_QUERY" ] && echo abort || echo "put(q)"';
    const probe = spawnSync('fzf', ['--bind', smart, '--filter', ''], {
        input: '',
        stdio: ['pipe', 'ignore', 'ignore'],
    });
    return !probe.error && probe.status !== 2 ? smart : 'q:abort';
}

module.exports = { opStar };
