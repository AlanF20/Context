# CHECKPOINTS — Objective criteria for correct final state

> In multi-agent systems, the path is not evaluated — the destination is.
> Any agent or human can run these checkpoints mechanically to decide
> whether the work is complete and healthy.
>
> Project: **Context Highlighter** (Chrome MV3). Code lives in `outputs/`.
> Verification is syntactic + logical (see `docs/verification.md`) — there is
> no test framework and no `specs/` JSON for now.

---

## C1 — Harness is complete

- [ ] Base files exist: `AGENTS.md`, `init.sh`, `feature_list.json`, `CHECKPOINTS.md`, `CLAUDE.md`
- [ ] Docs exist: `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`
- [ ] `progress/current.md` and `progress/history.md` exist
- [ ] The extension exists at `outputs/` with a valid `outputs/manifest.json`
- [ ] `./init.sh` exits with code 0

## C2 — State is consistent

- [ ] At most one feature in `in_progress` in `feature_list.json`
- [ ] Statuses are within `valid_status` (`pending`, `in_progress`, `done`, `blocked`)
- [ ] `progress/current.md` describes the active session or is empty

## C3 — Spec (when used)

- [ ] If a feature was scoped via a spec, `spec_path` points to it and it was approved by the human before implementation
- [ ] If no spec is used, the feature's `acceptance_criteria` in `feature_list.json` is the contract and is non-empty
- [ ] No `done` feature lacks both a spec and acceptance criteria

## C4 — Verification is real (not assertions)

- [ ] `node --check` passes on the classic scripts (`storage.js`, `content.js`, `background.js`)
- [ ] ES modules parse as ESM (`sidebar.js`, `sidebar/*.js` copied to `.mjs`)
- [ ] `outputs/manifest.json` is valid JSON
- [ ] Storage changes keep the `buildMd` ⇄ `parseMd` round-trip passing
- [ ] UI changes were loaded unpacked in Chrome with no console errors
- [ ] No retrieving vendored libs from a CDN (MV3 forbids remote code)

## C5 — Code respects architecture

- [ ] Implementer did not add functionality outside `acceptance_criteria`
- [ ] HTML, CSS and JS stay in separate files (no inline `<style>`/`<script>`/`style=`)
- [ ] Panel logic stays in ES modules; `content.js` and `storage.js` stay classic
- [ ] No new remote dependencies; anything third-party is vendored in `outputs/vendor/`
- [ ] Code follows `docs/conventions.md` and `CLAUDE.md`

## C6 — Feedback cycle was respected

- [ ] If Reviewer marked `failed_review`, the Orchestrator logged the retry in `progress/current.md`
- [ ] Retry counter did not exceed 3
- [ ] Reviewer report exists at `progress/review_<feature>.md`

## C7 — Session was closed cleanly

- [ ] `progress/history.md` has an entry for the last closed session
- [ ] No untracked temporary files (`*.tmp`, `*.log`, stray `*.mjs` copies)
- [ ] `progress/current.md` is empty or describes only the current active session
