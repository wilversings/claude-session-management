# claude-session

Star ⭐, move, and delete your [Claude Code](https://claude.com/claude-code) sessions from the terminal.

Starring drops a ⭐ into a session's title so it stands out in the `/resume` picker — no separate database, the star just rides along on the session file.

## Install

```sh
npm install -g claude-session-management
```

Needs Node ≥ 14. The interactive mode (`-i`) also wants [fzf](https://github.com/junegunn/fzf).

A global install also wires up `man claude-session`.

## Use

```sh
claude-session list                  # all projects, grouped
claude-session list ~/repos/my-app   # just one project
claude-session star 4bdd76           # ⭐ a session (current project)
claude-session unstar 4bdd76         # remove the ⭐
claude-session -i                    # browse + star/delete with fzf
claude-session -i ~/repos/my-app     # ...scoped to one project
claude-session mv 4bdd76 ~/old ~/new # move to another project
claude-session project ls             # list every project with session counts
claude-session project mv ~/old ~/new # move a whole project's sessions
claude-session rm 4bdd76             # delete one (asks first; -f to skip)
claude-session rm-untitled            # delete every untitled session (all projects, asks first)
claude-session rm-untitled ~/repos/x  # ...scoped to one project
claude-session project rm ~/repos/old  # delete a whole project + all its sessions (asks first)
```

`path` defaults to the current directory. Any unique chunk of a session id works — no need to type the whole UUID.

In the interactive browser (`-i`), each session shows its last modified time, the context-window
tokens it was using, its on-disk size, and its title:

```
2026-07-19 10:40    52.8k tok   174 KB  Add dockerfile and docker-compose configuration
2026-07-19 10:10   367.5k tok   7.5 MB  Design apartment scraper and ranking system
```

<kbd>tab</kbd> multi-selects, then a key decides what happens to the selection: <kbd>enter</kbd> flips the ⭐ on
everything selected, and <kbd>ctrl-x</kbd> (or <kbd>del</kbd>) deletes it (after a confirmation). Either way the
list hands straight back, so you can star, unstar, and delete as many sessions as you like — as
many times as you like — until you quit with <kbd>esc</kbd> or <kbd>q</kbd>.

Moving into a project that already exists **merges** the sessions in — existing sessions at
the destination are left alone, nothing gets overwritten.

### Export & import

Move sessions between machines (or back them up) as a self-contained archive:

```sh
claude-session export 4bdd76                  # one session -> claude-sessions-<ts>.tar.gz
claude-session export --project ~/repos/app   # a whole project
claude-session export --all -o backup.tar.gz  # everything, to a named file
claude-session export 4bdd76 -o sess.zip      # .zip instead of .tar.gz

claude-session import backup.tar.gz           # restore each session to its own project
claude-session import sess.zip --to ~/repos/x # force them all into one project
```

The archive carries a `manifest.json` recording each session's project, so `import`
puts sessions back where they belong.
The output extension picks the format: `.zip` uses `zip`/`unzip`, anything else is `.tar.gz`
(needs `tar`) — both are ambient system tools.

**On conflict:** a session conflicts when a `.jsonl` with the same session ID already
exists in the destination project. By default `import` **skips** it (printing
`exists, skipping (use -f to overwrite)`) and leaves the existing session untouched.
Pass `-f`/`--force` to **overwrite** conflicting sessions with the archived copy.
The closing summary reports how many were imported and how many were skipped.

Whole-project operations live under `project`: `project ls`, `project mv`, `project rm` (aliased `list`/`move`/`delete`).

Aliases: `ls`, `move`, `delete`/`remove`, `clean-untitled`, `proj`=`project`. `claude-session help` for the full list.

> Heads up: a *running* session caches its title, so starring the one you're in won't show the ⭐ in `/resume` until Claude Code reloads.

## License

MIT
