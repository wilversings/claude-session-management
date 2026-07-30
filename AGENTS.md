# AGENTS.md

Guidance for AI agents (and humans) working on this repo. Read before editing.

## What this is

A zero-dependency Node.js CLI (`claude-sessions.js`, exposed as `claude-session`)
that lists, stars, moves, and deletes Claude Code sessions.

## Layout

- `claude-sessions.js` — entry point: parses `argv[0]` and dispatches to a command.
- `lib/common.js` — shared helpers (project-dir resolution, title read/write,
  session lookup, filesystem/prompt utilities). Everything reusable lives here.
- `commands/<op>.js` — one file per operation, each exporting its `op*` function
  (`list`, `projects`, `star`, `unstar`, `mv`, `rm`, `export`, `import`, `help`).
  A helper used by only one command (e.g. `rmInteractive`, `collectSessions`)
  stays private to that command's file; promote it to `lib/common.js` only when a
  second command needs it. Still no npm deps — modules `require` each other only.

## How Claude Code stores sessions

- One session = one file: `~/.claude/projects/<encoded-path>/<session-id>.jsonl`.
- `<encoded-path>` is the project's absolute path with every `/` replaced by `-`.
- The `.jsonl` filename base **is** the session's `sessionId`.
- Each line is a JSON record. Titles come from records of two types:
  - `{"type":"custom-title","customTitle":"...","sessionId":"..."}` — from `/rename` (or us).
  - `{"type":"ai-title","aiTitle":"...","sessionId":"..."}` — auto-generated.
- **The LAST title record in the file wins**, and `custom-title` is what `/rename` writes.

## Invariants — do not break these

1. **Never rename or restructure a `.jsonl` file.** `/resume` matches the filename
   against the `sessionId` stored *inside* the file. Rename the file and the
   session becomes unresumable. `mv` between projects moves the file across
   directories but keeps the same basename — that's fine.
2. **Starring = a ⭐ in the title, nothing else.** To star, append a new
   `custom-title` record whose `customTitle` is `⭐ <old title>`. To unstar, append
   one with the star stripped. There is **no** sidecar/star database — the star
   lives in the file so it travels on `mv` and vanishes on `rm` for free.
3. **Guard the trailing newline before appending.** If the file's last byte isn't
   `\n`, our record glues onto the previous line, that line fails `JSON.parse`,
   and `/resume` silently drops it. Always ensure a trailing newline first.
4. **Keep it dependency-free.** No npm deps — standard library only. A few
   *optional* external tools are shelled out to and must degrade gracefully when
   absent: `fzf` (for `rm -i`), and `tar` / `zip` / `unzip` (for `export` and
   `import`, chosen by whether the archive name ends in `.zip`).
5. **Titles are literal UTF-8.** Use `JSON.stringify` to build records so `⭐` and
   any user text are escaped correctly — mirror exactly what `/rename` writes.

## Behavior notes

- Session ids accept a unique partial (substring of the filename). Ambiguous or
  missing matches print a diagnostic and exit non-zero.
- `list` with no path groups every project; with a path lists just that one.
- `mv` doesn't rewrite the `cwd` recorded inside the file — display-only, harmless.
- A *running* session caches its own title in memory, so re-starring the active
  session won't restar in `/resume` until Claude Code reloads.
- `export` bundles the raw `.jsonl` files plus a `manifest.json` (each session's
  `sessionId`, `cwd`, and `title`). `import` reads the manifest and drops each
  file into the project dir for its recorded `cwd` (or `--to` to override), never
  changing the basename — same reasoning as invariant #1. Existing files are left
  untouched unless `-f`. Staging happens in a `mkdtemp` dir that's always cleaned
  up in a `finally`.

## Conventions

- CommonJS, `'use strict'`, 4-space indent, no build step. One file per command
  under `commands/`; shared code in `lib/common.js`.
- Operations return an exit code; `main` returns it and `process.exit` uses it.
- Verify syntax with `npm test` (`node --check` over every file). Test destructive paths against a
  throwaway `~/.claude/projects/<encoded>` dir, never real sessions.
