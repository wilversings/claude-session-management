// star — prepend ⭐ to a session's title so /resume shows it starred.

'use strict';

const path = require('path');
const { STAR, projectDir, resolveSession, sessionTitle, setTitle, titleIsStarred } = require('../lib/common');

// Star a session: prepend ⭐ to its title so /resume shows it starred.
function opStar(args) {
    const sessionId = args[0];
    const targetPath = args[1] || process.cwd();
    if (!sessionId) {
        console.log('Usage: claude-session star <session-id-or-partial> [project-path]');
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

    const newTitle = title ? `${STAR} ${title}` : STAR;
    setTitle(match, id, newTitle);
    console.log(`Starred: ${id}`);
    console.log(`  title: ${newTitle}`);
    return 0;
}

module.exports = { opStar };
