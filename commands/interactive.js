// interactive — one fzf browser that both stars/unstars and deletes sessions.
//
// A single screen replaces the old `star -i` and `rm -i`: different keys do
// different things to the selection. Because fzf's --expect reports which key
// accepted the list, one prompt can dispatch several actions.
//   enter          -> toggle ⭐ on the selection
//   ctrl-x / del   -> delete the selection (asks to confirm first)
//   q / esc        -> quit

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    projectDir,
    listJsonl,
    readText,
    titleFromContent,
    contextTokensFromContent,
    sessionTitle,
    setTitle,
    titleIsStarred,
    starTitle,
    unstarTitle,
    fmtMtime,
    fmtTokens,
    fmtSize,
    promptLine,
    isDir,
    hasCommand,
} = require('../lib/common');

// Browse sessions (newest first) and act on the selection: enter toggles the
// star, ctrl-x/del deletes. The list reopens after every action, keeping the
// same query, until you quit with q/esc.
function opInteractive(args) {
    const positional = args.filter((a) => a !== '-i' && a !== '--interactive');

    if (!hasCommand('fzf')) {
        console.log('This requires fzf (https://github.com/junegunn/fzf). Install it and try again.');
        return 1;
    }

    const targetPath = positional[0] || process.cwd();
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
            console.log(`No sessions left in ${dir}`);
            break;
        }

        // Each session read once, deriving title + context tokens from the same
        // content. fields: id (hidden) \t one padded display column.
        const items = names.map((name) => {
            const full = path.join(dir, name);
            const st = fs.statSync(full);
            const content = readText(full);
            return {
                id: name.replace(/\.jsonl$/, ''),
                epoch: st.mtimeMs,
                mtime: fmtMtime(st.mtime),
                tokens: fmtTokens(contextTokensFromContent(content)),
                size: fmtSize(st.size),
                title: titleFromContent(content) || '(untitled)',
            };
        });
        items.sort((a, b) => b.epoch - a.epoch); // newest first

        // Right-align the token/size columns so they line up down the list.
        const input = items.map((it) => `${it.id}\t${displayRow(it)}`).join('\n');
        const res = spawnSync(
            'fzf',
            [
                '--delimiter=\t',
                '--with-nth=2',
                '--multi',
                '--height=60%',
                '--border',
                '--reverse',
                '--print-query',
                '--expect=enter,ctrl-x,del',
                `--query=${query}`,
                '--bind',
                quitBind,
                '--header',
                'modified · ctx-tokens · size · title   |   tab: multi-select · enter: toggle ⭐ · ctrl-x/del: delete · q/esc: quit',
            ],
            { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }
        );

        if (res.error) {
            console.error(`Could not run fzf: ${res.error.message}`);
            return 1;
        }

        // With --print-query then --expect, fzf prints the query on the first
        // line, the accepting key on the second, then the selected rows.
        const lines = (res.stdout || '').split('\n');
        query = lines[0] || '';
        const key = lines[1] || '';
        if (res.status !== 0) break; // esc/q/ctrl-c abort (130), or nothing matched (1)

        const selected = lines.slice(2).filter((l) => l.length > 0);
        if (selected.length === 0) continue;

        if (key === 'ctrl-x' || key === 'del') {
            deleteSelection(dir, selected);
        } else {
            for (const line of selected) {
                const id = line.split('\t')[0];
                toggleStar(path.join(dir, `${id}.jsonl`), id);
            }
        }
    }
    return 0;
}

// Render one fzf row: modified · context-tokens · size · title, columns padded
// so they line up down the list.
function displayRow(it) {
    return `${it.mtime}  ${it.tokens.padStart(7)} tok  ${it.size.padStart(7)}  ${it.title}`;
}

// Confirm, then delete every selected session.
function deleteSelection(dir, selected) {
    const toDelete = selected.map((l) => {
        const [id, display] = l.split('\t');
        return { id, display };
    });

    console.log('About to permanently delete:');
    for (const d of toDelete) console.log(`  ${d.display}`);

    const confirm = promptLine(`Confirm delete of ${toDelete.length} session(s)? [y/N] `);
    if (!/^[Yy]/.test(confirm)) {
        console.log('Aborted this batch.');
        return;
    }

    for (const d of toDelete) {
        fs.rmSync(path.join(dir, `${d.id}.jsonl`));
        console.log(`Deleted: ${d.id}.jsonl`);
    }
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

module.exports = { opInteractive };
