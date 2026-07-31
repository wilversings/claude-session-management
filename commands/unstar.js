// unstar — strip the leading ⭐ from a session's title
// (add -i for the same interactive fzf toggler `star -i` opens).

'use strict';

const path = require('path');
const { projectDir, resolveSession, sessionTitle, setTitle, titleIsStarred, unstarTitle } = require('../lib/common');
const { opStar } = require('./star');

// Unstar a session: strip the leading ⭐ from its title.
function opUnstar(args) {
    // The interactive browser toggles, so `unstar -i` is `star -i`.
    if (args.some((a) => a === '-i' || a === '--interactive')) return opStar(args);

    const sessionId = args[0];
    const targetPath = args[1] || process.cwd();
    if (!sessionId) {
        console.log('Usage: claude-session unstar <session-id-or-partial> [project-path]');
        console.log('       claude-session unstar -i [project-path]   (interactive)');
        return 1;
    }
    const dir = projectDir(targetPath);
    const match = resolveSession(dir, sessionId);
    if (!match) return 1;

    const id = path.basename(match, '.jsonl');
    const title = sessionTitle(match);
    if (!titleIsStarred(title)) {
        console.log(`Not starred: ${id}`);
        return 1;
    }

    const newTitle = unstarTitle(title);
    setTitle(match, id, newTitle);
    console.log(`Unstarred: ${id}`);
    console.log(`  title: ${newTitle}`);
    return 0;
}

module.exports = { opUnstar };
