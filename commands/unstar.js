// unstar — strip the leading ⭐ from a session's title.

'use strict';

const path = require('path');
const { projectDir, resolveSession, sessionTitle, setTitle, titleIsStarred } = require('../lib/common');

// Unstar a session: strip the leading ⭐ from its title.
function opUnstar(args) {
    const sessionId = args[0];
    const targetPath = args[1] || process.cwd();
    if (!sessionId) {
        console.log('Usage: claude-session unstar <session-id-or-partial> [project-path]');
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

    const newTitle = title.replace(/^⭐\s*/, '');
    setTitle(match, id, newTitle);
    console.log(`Unstarred: ${id}`);
    console.log(`  title: ${newTitle}`);
    return 0;
}

module.exports = { opUnstar };
