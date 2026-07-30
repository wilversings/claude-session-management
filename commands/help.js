// help — usage summary for all operations.

'use strict';

function opHelp() {
    console.log('Manage Claude Code sessions: pin, move, delete, export, and import.');
    console.log('');
    console.log('Usage: claude-session <operation> [args...]');
    console.log('');
    console.log('Operations:');
    console.log('  list  [path]                              List sessions; no path = all projects grouped');
    console.log('  projects                                  List all projects with session counts');
    console.log('  pin   <session-id-or-partial> [path]      Star a session (shows ⭐ in /resume)');
    console.log("  unpin <session-id-or-partial> [path]      Remove a session's star");
    console.log('  mv    <session-id-or-partial> <from> <to> Move a session between project paths');
    console.log('  mv-project <from-path> <to-path>          Move a whole project (all its sessions)');
    console.log('  rm    [-f|--force] <id-or-partial> [path] Delete a session');
    console.log('  rm    -i [path]                           Interactively browse + delete (fzf)');
    console.log('  rm-untitled [-f|--force] [path]           Delete all untitled sessions (asks first)');
    console.log('  rm-project [-f|--force] [path]            Delete a whole project + all its sessions (asks first)');
    console.log('  export <id-or-partial> [path] [-o out]    Export a session to an archive');
    console.log('  export --project [path] [-o out]          Export a whole project');
    console.log('  export --all [-o out]                     Export every session');
    console.log('  import <archive> [--to path] [-f]         Import sessions from an archive');
    console.log('');
    console.log('Archives are .tar.gz by default, or .zip if the output name ends in .zip');
    console.log('(needs tar / zip+unzip on PATH). Import restores each session to the');
    console.log('project it came from, or use --to to redirect them all to one project.');
    console.log('');
    console.log('Aliases: ls=list, proj=projects, move=mv, move-project=mv-project, delete/remove=rm, clean-untitled=rm-untitled, help/-h/--help');
    return 0;
}

module.exports = { opHelp };
