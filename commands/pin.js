// pin — prepend ⭐ to a session's title so /resume shows it starred.

'use strict';

const path = require('path');
const { STAR, projectDir, resolveSession, sessionTitle, setTitle, titleIsPinned } = require('../lib/common');

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

module.exports = { opPin };
