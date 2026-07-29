// unpin — strip the leading ⭐ from a session's title.

'use strict';

const path = require('path');
const { projectDir, resolveSession, sessionTitle, setTitle, titleIsPinned } = require('../lib/common');

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

module.exports = { opUnpin };
