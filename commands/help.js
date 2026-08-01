// help — usage summary for all operations.

'use strict';

function opHelp() {
    console.log('Manage Claude Code sessions: star, move, delete, export, and import.');
    console.log('');
    console.log('Usage: claude-session <operation> [args...]');
    console.log('');
    console.log('Operations:');
    console.log('  list  [path]                              List sessions; no path = all projects grouped');
    console.log('  project ls                                List all projects with session counts');
    console.log('  project mv [-f|--force] <from> <to>       Move a whole project (all its sessions)');
    console.log("                                             If <to> exists, sessions merge in; collisions prompt (o/a/s/l), -f overwrites all");
    console.log('  project rm [-f|--force] [path]            Delete a whole project + all its sessions (asks first)');
    console.log('  project export [path] [-o out]            Export a whole project to an archive');
    console.log('  star   <session-id-or-partial> [path]     Star a session (shows ⭐ in /resume)');
    console.log("  unstar <session-id-or-partial> [path]     Remove a session's star");
    console.log('  -i [path]                                 Interactive fzf browser: enter toggles ⭐, ctrl-x/del deletes');
    console.log('  mv    <session-id-or-partial> <from> <to> Move a session between project paths');
    console.log('  rm    [-f|--force] <id-or-partial> [path] Delete a session');
    console.log('  rm-untitled [-f|--force] [path]           Delete all untitled sessions (asks first)');
    console.log('  export <id-or-partial> [path] [-o out]    Export a session to an archive');
    console.log('  export --all [-o out]                     Export every session');
    console.log('  import <archive> [--to path] [-f]         Import sessions from an archive');
    console.log('');
    console.log('Archives are .tar.gz by default, or .zip if the output name ends in .zip');
    console.log('(needs tar / zip+unzip on PATH). Import restores each session to the');
    console.log('project it came from, or use --to to redirect them all to one project.');
    console.log('');
    console.log('Aliases: ls=list, proj=project, move=mv, delete/remove=rm, clean-untitled=rm-untitled, help/-h/--help');
    console.log('  project subcommands: ls (list), mv (move), rm (delete/remove), export');
    return 0;
}

module.exports = { opHelp };
