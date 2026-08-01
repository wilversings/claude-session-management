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
  A helper used by only one command (e.g. `rmInteractive`, `starInteractive`,
  `collectSessions`) stays private to that command's file; promote it to
  `lib/common.js` only when a second command needs it. Still no npm deps —
  modules `require` each other only (`unstar` calls into `star` for `-i`, since
  the interactive browser toggles and is therefore the same screen for both).

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
4. **Keep it dependency-free at runtime.** No npm deps required to run — standard
   library only. A few *optional* external tools are shelled out to and must
   degrade gracefully when absent: `fzf` (for `rm -i` and `star -i`), and
   `tar` / `zip` / `unzip` (for `export` and `import`, chosen by whether the
   archive name ends in `.zip`). `esbuild` is a devDependency used only to
   produce the published bundle (see Build below) — it never ships as
   something a user's install needs to fetch or run.
   Degrade across *versions* too: `star -i` binds `q` to quit-only-while-the-query-
   is-empty via fzf's `transform` + `$FZF_QUERY`, falling back to a plain
   `q:abort` where that isn't supported. Support is **probed, not version-sniffed**
   — `fzf --bind <spec> --filter ''` parses the bind without opening a UI and
   exits 2 on an unknown action.
5. **Titles are literal UTF-8.** Use `JSON.stringify` to build records so `⭐` and
   any user text are escaped correctly — mirror exactly what `/rename` writes.

## Behavior notes

- Session ids accept a unique partial (substring of the filename). Ambiguous or
  missing matches print a diagnostic and exit non-zero.
- `list` with no path groups every project; with a path lists just that one.
- `mv` doesn't rewrite the `cwd` recorded inside the file — display-only, harmless.
- A *running* session caches its own title in memory, so re-starring the active
  session won't restar in `/resume` until Claude Code reloads.
- `star -i` / `unstar -i` open one toggling browser: `enter` flips the star on
  every selected session, then the list is rebuilt from disk and reopened (with
  the previous query restored via `--print-query` / `--query`), so it loops until
  `esc`/`q`. Toggling reads the title fresh from the file rather than the fzf
  line, so repeated toggles of the same session stay correct.
- `export` bundles the raw `.jsonl` files plus a `manifest.json` (each session's
  `sessionId`, `cwd`, and `title`). `import` reads the manifest and drops each
  file into the project dir for its recorded `cwd` (or `--to` to override), never
  changing the basename — same reasoning as invariant #1. Existing files are left
  untouched unless `-f`. Staging happens in a `mkdtemp` dir that's always cleaned
  up in a `finally`.

## Conventions

- CommonJS, `'use strict'`, 4-space indent. One file per command under
  `commands/`; shared code in `lib/common.js`.
- Operations return an exit code; `main` returns it and `process.exit` uses it.
- Verify syntax with `npm test` (`node --check` over every file). Test destructive paths against a
  throwaway `~/.claude/projects/<encoded>` dir, never real sessions.

## Build

`claude-sessions.js` and `commands/*.js`/`lib/common.js` are the source of
truth and stay unbundled, readable CommonJS — edit those, not the build
output. `npm run build` (esbuild, devDependency only) bundles + minifies them
into `dist/claude-session.js`, which is what `bin.claude-session` in
`package.json` points at — that's the file that actually runs when someone
installs the package. `dist/` is gitignored and rebuilt via the `prepare`
npm lifecycle script, so it's generated automatically on `npm install`
(local clone or git dependency) and on `npm publish`/`npm pack`; registry
installs get the already-built file from the published tarball and never
run esbuild themselves. If you change source, run `npm run build` and smoke
test `dist/claude-session.js` before committing anything that depends on it.
