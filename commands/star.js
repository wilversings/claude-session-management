// star — prepend ⭐ to a session's title so /resume shows it starred.
// (For an interactive fzf browser that toggles stars, use `claude-session -i`.)

'use strict';

const path = require('path');
const {
    projectDir,
    resolveSession,
    sessionTitle,
    setTitle,
    titleIsStarred,
    starTitle,
} = require('../lib/common');

// Star a session: prepend ⭐ to its title so /resume shows it starred.
function opStar(args) {
    const positional = args.filter((a) => a !== '-i' && a !== '--interactive');

    const sessionId = positional[0];
    const targetPath = positional[1] || process.cwd();
    if (!sessionId) {
        console.log('Usage: claude-session star <session-id-or-partial> [project-path]');
        console.log('       claude-session -i [project-path]   (interactive browse + toggle ⭐/delete)');
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

module.exports = { opStar };
