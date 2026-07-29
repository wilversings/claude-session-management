# AGENTS.md

Guidance for AI agents (and humans) working on this repo. Read before editing.

## What this is

A single-file, zero-dependency Node.js CLI (`claude-sessions.js`, exposed as
`claude-session`) that lists, pins, moves, and deletes Claude Code sessions.

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
2. **Pinning = a ⭐ in the title, nothing else.** To pin, append a new
   `custom-title` record whose `customTitle` is `⭐ <old title>`. To unpin, append
   one with the star stripped. There is **no** sidecar/pin database — the star
   lives in the file so it travels on `mv` and vanishes on `rm` for free.
3. **Guard the trailing newline before appending.** If the file's last byte isn't
   `\n`, our record glues onto the previous line, that line fails `JSON.parse`,
   and `/resume` silently drops it. Always ensure a trailing newline first.
4. **Keep it dependency-free.** Standard library only. `fzf` is an *optional*
   external tool, used solely by `rm -i`; degrade gracefully when it's absent.
5. **Titles are literal UTF-8.** Use `JSON.stringify` to build records so `⭐` and
   any user text are escaped correctly — mirror exactly what `/rename` writes.

## Behavior notes

- Session ids accept a unique partial (substring of the filename). Ambiguous or
  missing matches print a diagnostic and exit non-zero.
- `list` with no path groups every project; with a path lists just that one.
- `mv` doesn't rewrite the `cwd` recorded inside the file — display-only, harmless.
- A *running* session caches its own title in memory, so re-pinning the active
  session won't restar in `/resume` until Claude Code reloads.

## Conventions

- CommonJS, `'use strict'`, 4-space indent, no build step.
- Operations return an exit code; `main` returns it and `process.exit` uses it.
- Verify syntax with `npm test` (`node --check`). Test destructive paths against a
  throwaway `~/.claude/projects/<encoded>` dir, never real sessions.
