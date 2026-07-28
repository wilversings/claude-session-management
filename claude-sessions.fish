# Claude Code session management: pin (star), move, and delete sessions.
# Sessions live at ~/.claude/projects/<path-with-slashes-replaced-by-dashes>/<session-id>.jsonl
#
# Pinning writes a ⭐ into the session's own title so it shows up starred in
# Claude Code's /resume picker. It does this the same way /rename does: by
# appending a "custom-title" record to the .jsonl (the last such record wins).
# The file is NEVER renamed — /resume matches a session's filename against the
# "sessionId" recorded inside the file, so renaming breaks the lookup.
#
# Because the star lives inside the file, it travels automatically on `mv` and
# disappears on `rm` — there is no separate pin database to keep in sync.
#
# Single entry point: `claude-session <operation> [args...]`
#   claude-session list   [path]
#   claude-session pin     <session-id-or-partial> [path]
#   claude-session unpin   <session-id-or-partial> [path]
#   claude-session mv      <session-id-or-partial> <from-path> <to-path>
#   claude-session rm      [-f|--force] <session-id-or-partial> [path]
#   claude-session rm -i   [path]        # interactive browse + delete (fzf)

function __claude_project_dir --description 'Resolve an absolute path to its Claude Code project directory'
    set -l abs_path (realpath $argv[1])
    set -l encoded (string replace -a '/' '-' -- $abs_path)
    echo ~/.claude/projects/$encoded
end

function __claude_session_title --description 'Get the title of a session file: a custom-title (/rename or pin) wins over the auto-generated ai-title'
    set -l custom (grep -o '"type":"custom-title"[^}]*"customTitle":"[^"]*"' $argv[1] 2>/dev/null | tail -n1 | string replace -r '.*"customTitle":"([^"]*)".*' '$1')
    if test -n "$custom"
        echo $custom
        return
    end
    grep -o '"type":"ai-title"[^}]*"aiTitle":"[^"]*"' $argv[1] 2>/dev/null | tail -n1 | string replace -r '.*"aiTitle":"([^"]*)".*' '$1'
end

function __claude_set_title --description 'Append a custom-title record (exactly like /rename) so the new title shows in /resume'
    set -l file $argv[1]
    set -l id $argv[2]
    set -l title $argv[3]
    # Claude Code reads the LAST custom-title record from the file. Each record
    # must be its own JSONL line, so guarantee the file ends in a newline before
    # appending — otherwise `>>` would glue our object onto the previous line and
    # the resulting line fails JSON.parse and is silently ignored by /resume.
    if test -s $file; and test (tail -c1 $file | wc -l) -eq 0
        echo >> $file
    end
    # jq emits a correctly-escaped one-line JSON record.
    jq -nc --arg id "$id" --arg t "$title" \
        '{type: "custom-title", customTitle: $t, sessionId: $id}' >> $file
end

function __claude_title_is_pinned --description 'True if a title string is starred'
    string match -q '⭐*' -- $argv[1]
end

# Resolve a single session .jsonl from a partial id within <dir>.
# On success prints the matching file path and returns 0.
# On no/many matches prints a diagnostic to stderr and returns non-zero.
function __claude_session_resolve --description 'Resolve one session .jsonl from a partial id in a project dir'
    set -l dir $argv[1]
    set -l session_id $argv[2]

    set -l matches (find $dir -maxdepth 1 -iname "*$session_id*.jsonl" 2>/dev/null)
    if test (count $matches) -eq 0
        echo "No session matching '$session_id' found in $dir" >&2
        return 1
    end
    if test (count $matches) -gt 1
        echo "Multiple matches, be more specific:" >&2
        printf '%s\n' $matches >&2
        return 1
    end
    echo $matches[1]
end

function __claude_project_cwd --description 'Best-effort real project path for a project dir (reads cwd from a session; falls back to the encoded dir name)'
    set -l dir $argv[1]
    for f in $dir/*.jsonl
        set -l cwd (grep -o '"cwd":"[^"]*"' $f 2>/dev/null | head -1 | string replace -r '"cwd":"([^"]*)"' '$1')
        if test -n "$cwd"
            echo $cwd
            return
        end
    end
    basename $dir
end

function __claude_list_dir --description 'Print one session per line for a project dir (optional indent prefix as arg 2)'
    set -l dir $argv[1]
    set -l indent $argv[2]
    for f in $dir/*.jsonl
        set -l base (basename $f .jsonl)
        set -l mtime (date -d @(stat -c %Y $f) '+%Y-%m-%d %H:%M')
        set -l title (__claude_session_title $f)
        if test -z "$title"
            set title "(untitled)"
        end
        echo "$indent$base   (modified $mtime)   $title"
    end
end

function __claude_session_list --description 'List Claude Code sessions: no path = every project grouped; a path = just that project'
    set -l target_path $argv[1]

    # A path was given: list just that project (no group header).
    if test -n "$target_path"
        set -l dir (__claude_project_dir $target_path)
        if not test -d $dir
            echo "No Claude Code sessions found for $target_path"
            return 1
        end
        __claude_list_dir $dir
        return
    end

    # No path: list every project, grouped, with the project path as a header.
    set -l any 0
    set -l first 1
    for dir in ~/.claude/projects/*/
        set -l files
        for f in $dir*.jsonl
            set -a files $f
        end
        if test (count $files) -eq 0
            continue
        end
        set any 1
        if test $first -eq 0
            echo
        end
        set first 0
        echo (__claude_project_cwd $dir)
        __claude_list_dir $dir "  "
    end

    if test $any -eq 0
        echo "No Claude Code sessions found"
        return 1
    end
end

function __claude_session_pin --description 'Pin a session: prepend ⭐ to its title so /resume shows it starred'
    set -l session_id $argv[1]
    set -l target_path $argv[2]
    if test -z "$session_id"
        echo "Usage: claude-session pin <session-id-or-partial> [project-path]"
        return 1
    end
    if test -z "$target_path"
        set target_path (pwd)
    end
    set -l dir (__claude_project_dir $target_path)

    set -l match (__claude_session_resolve $dir $session_id); or return 1
    set -l id (basename $match .jsonl)
    set -l title (__claude_session_title $match)

    if __claude_title_is_pinned "$title"
        echo "Already pinned: $id"
        return 1
    end

    set -l new_title (string trim -- (string join '' '⭐ ' $title))
    __claude_set_title $match $id "$new_title"
    echo "Pinned: $id"
    echo "  title: $new_title"
end

function __claude_session_unpin --description 'Unpin a session: strip the leading ⭐ from its title'
    set -l session_id $argv[1]
    set -l target_path $argv[2]
    if test -z "$session_id"
        echo "Usage: claude-session unpin <session-id-or-partial> [project-path]"
        return 1
    end
    if test -z "$target_path"
        set target_path (pwd)
    end
    set -l dir (__claude_project_dir $target_path)

    set -l match (__claude_session_resolve $dir $session_id); or return 1
    set -l id (basename $match .jsonl)
    set -l title (__claude_session_title $match)

    if not __claude_title_is_pinned "$title"
        echo "Not pinned: $id"
        return 1
    end

    set -l new_title (string replace -r '^⭐\s*' '' -- $title)
    __claude_set_title $match $id "$new_title"
    echo "Unpinned: $id"
    echo "  title: $new_title"
end

function __claude_session_mv --description 'Move a Claude Code session from one project path to another'
    set -l session_id $argv[1]
    set -l from_path $argv[2]
    set -l to_path $argv[3]
    if test -z "$session_id" -o -z "$from_path" -o -z "$to_path"
        echo "Usage: claude-session mv <session-id-or-partial> <from-path> <to-path>"
        return 1
    end

    set -l from_dir (__claude_project_dir $from_path)
    set -l to_dir (__claude_project_dir $to_path)

    set -l match (__claude_session_resolve $from_dir $session_id); or return 1

    mkdir -p $to_dir
    set -l base (basename $match)
    mv $match $to_dir/$base
    echo "Moved $base"
    echo "  from: $from_dir"
    echo "  to:   $to_dir"
    echo "Note: entries inside the file still record the old 'cwd' — this affects display only, not the move."
end

function __claude_session_rm --description 'Delete Claude Code sessions (add -i for an interactive fzf browser)'
    set -l force 0
    set -l interactive 0
    set -l pos
    for a in $argv
        switch $a
            case -f --force
                set force 1
            case -i --interactive
                set interactive 1
            case '*'
                set pos $pos $a
        end
    end

    if test $interactive -eq 1
        __claude_session_rm_interactive $pos
        return
    end

    set -l session_id $pos[1]
    set -l target_path $pos[2]
    if test -z "$session_id"
        echo "Usage: claude-session rm [-f|--force] <session-id-or-partial> [project-path]"
        echo "       claude-session rm -i [project-path]   (interactive)"
        return 1
    end
    if test -z "$target_path"
        set target_path (pwd)
    end
    set -l dir (__claude_project_dir $target_path)

    set -l match (__claude_session_resolve $dir $session_id); or return 1

    set -l base (basename $match)
    if test $force -eq 0
        read -l -P "Delete session $base? [y/N] " confirm
        if not string match -qr '^[Yy]' -- $confirm
            echo "Aborted."
            return 1
        end
    end

    rm $match
    echo "Deleted: $base"
end

function __claude_session_rm_interactive --description 'Interactively browse and delete Claude Code sessions (arrow keys + fzf), newest first'
    if not type -q fzf
        echo "This requires fzf (https://github.com/junegunn/fzf). Install it and try again."
        return 1
    end

    set -l target_path $argv[1]
    if test -z "$target_path"
        set target_path (pwd)
    end
    set -l dir (__claude_project_dir $target_path)

    if not test -d $dir
        echo "No Claude Code sessions found for $target_path"
        return 1
    end

    while true
        set -l entries $dir/*.jsonl
        if test (count $entries) -eq 0
            echo "No sessions left in $dir"
            break
        end

        # fields: epoch (sort key, hidden) \t id (hidden) \t modified \t title
        set -l lines
        for f in $entries
            set -l base (basename $f .jsonl)
            set -l epoch (stat -c %Y $f)
            set -l mtime (date -d @$epoch '+%Y-%m-%d %H:%M')
            set -l title (__claude_session_title $f)
            if test -z "$title"
                set title "(untitled)"
            end
            set -a lines (printf '%s\t%s\t%s\t%s' $epoch $base $mtime $title)
        end

        set -l sorted (printf '%s\n' $lines | sort -t \t -k1,1 -nr)

        set -l selected (printf '%s\n' $sorted | fzf \
            --delimiter=\t --with-nth=3,4 \
            --multi --height=60% --border --reverse \
            --header 'arrows/j-k: move · tab: multi-select · enter: delete batch · esc: quit')

        if test -z "$selected"
            break
        end

        set -l to_delete_files
        echo "About to permanently delete:"
        for s in $selected
            set -l fields (string split \t -- $s)
            set -l id $fields[2]
            set -l mtime $fields[3]
            set -l title $fields[4]
            echo "  $title  (modified $mtime)"
            set -a to_delete_files $dir/$id.jsonl
        end

        read -l -P "Confirm delete of "(count $to_delete_files)" session(s)? [y/N] " confirm
        if not string match -qr '^[Yy]' -- $confirm
            echo "Aborted this batch."
            continue
        end

        for f in $to_delete_files
            rm $f
            echo "Deleted: "(basename $f)
        end
    end
end

function __claude_session_help --description 'Print claude-session usage'
    echo "Manage Claude Code sessions: pin, move, and delete."
    echo
    echo "Usage: claude-session <operation> [args...]"
    echo
    echo "Operations:"
    echo "  list  [path]                              List sessions; no path = all projects grouped"
    echo "  pin   <session-id-or-partial> [path]      Star a session (shows ⭐ in /resume)"
    echo "  unpin <session-id-or-partial> [path]      Remove a session's star"
    echo "  mv    <session-id-or-partial> <from> <to> Move a session between project paths"
    echo "  rm    [-f|--force] <id-or-partial> [path] Delete a session"
    echo "  rm    -i [path]                           Interactively browse + delete (fzf)"
    echo
    echo "Aliases: ls=list, move=mv, delete/remove=rm, help/-h/--help"
end

function claude-session --description 'Manage Claude Code sessions: list, pin, unpin, mv, rm'
    set -l cmd $argv[1]
    if test (count $argv) -gt 0
        set -e argv[1]
    end

    switch "$cmd"
        case list ls
            __claude_session_list $argv
        case pin
            __claude_session_pin $argv
        case unpin
            __claude_session_unpin $argv
        case mv move
            __claude_session_mv $argv
        case rm delete remove
            __claude_session_rm $argv
        case '' help -h --help
            __claude_session_help
        case '*'
            echo "Unknown operation: $cmd" >&2
            echo >&2
            __claude_session_help >&2
            return 1
    end
end
