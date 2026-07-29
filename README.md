# claude-session

Pin ⭐, move, and delete your [Claude Code](https://claude.com/claude-code) sessions from the terminal.

Pinning drops a ⭐ into a session's title so it stands out in the `/resume` picker — no separate database, the star just rides along on the session file.

## Install

```sh
npm install -g claude-session-management
```

Needs Node ≥ 14. The interactive delete (`rm -i`) also wants [fzf](https://github.com/junegunn/fzf).

## Use

```sh
claude-session list                  # all projects, grouped
claude-session list ~/repos/my-app   # just one project
claude-session pin 4bdd76            # ⭐ a session (current project)
claude-session unpin 4bdd76          # remove the ⭐
claude-session mv 4bdd76 ~/old ~/new # move to another project
claude-session rm 4bdd76             # delete one (asks first; -f to skip)
claude-session rm -i                 # browse + delete with fzf
```

`path` defaults to the current directory. Any unique chunk of a session id works — no need to type the whole UUID.

Aliases: `ls`, `move`, `delete`/`remove`. `claude-session help` for the full list.

> Heads up: a *running* session caches its title, so pinning the one you're in won't show the ⭐ in `/resume` until Claude Code reloads.

## License

MIT
