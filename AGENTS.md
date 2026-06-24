# AGENTS.md — Navigation map for AI agents

> This is the **entry point** for any agent working in this repository.
> This is NOT a rulebook — it is a **map**. Read only what you need, when you need it
> (progressive disclosure).

---

## 1. Before starting (mandatory)

1. Run `./init.sh` and verify it exits without errors. If it fails, **stop** and fix the environment before touching anything.
2. Read `progress/current.md` to understand the state left by the last session.
3. Read `feature_list.json` and pick **one** task with status `pending`. Never work on more than one at a time.

---

This repository builds **Context Highlighter**, a Chrome MV3 extension. The
active extension lives under **`vite-extension/`** (Vite + pnpm + @crxjs/vite-plugin).
Source code is in `vite-extension/src/`; the built extension is in `vite-extension/dist/`.
`outputs/` is **legacy/frozen** — do not edit it for new features.
There is no tests framework — verification is `pnpm run build` + manual Chrome load,
defined in `docs/verification.md`. Feature specs live in `specs/` as structured JSON files.

## 2. Repository map

| File / folder             | Contents                                                 | When to read              |
|---------------------------|----------------------------------------------------------|---------------------------|
| `feature_list.json`       | Feature backlog with status and acceptance criteria      | Always, at start          |
| `progress/current.md`     | Live state of the active session                         | Always, at start          |
| `progress/history.md`     | Append-only log of past sessions                         | When you need history     |
| `CLAUDE.md`               | Project memory: conventions + file map (what's written)  | Always, at start          |
| `DESIGN_SPEC.md`          | Visual/behavior spec for the UI redesign                 | Before UI work            |
| `navigator.html`          | Reference render of the UI (guide only, do NOT copy)     | For visual reference      |
| `docs/architecture.md`    | What "doing good work" means in this project             | Before implementing       |
| `docs/conventions.md`     | Code style, naming rules, file structure                 | Before writing code       |
| `docs/verification.md`    | How to prove that the work actually works                | Before declaring done     |
| `CHECKPOINTS.md`          | Objective criteria for "correct final state"             | For self-evaluation       |
| `vite-extension/src/`     | **The extension source** (manifest, storage.js, content.*, side panel) | To implement |
| `vite-extension/src/sidebar/` | ES modules of the side panel (rail, vista, editor, …) | To implement panel logic |
| `vite-extension/dist/`    | Built extension — load this in Chrome                    | To test manually          |
| `outputs/`                | **Legacy/frozen** — do not edit for new features         | Reference only            |
| `specs/`                  | Feature specs as JSON (`NNN-spec-<name>.json`); validated by `init.sh` step 3 | Before implementing |

---

## 3. SDD flow — agent activation order

```
Researcher → Spec-Writer → [HUMAN APPROVAL] → Tester → Implementer → Reviewer
                                                              ↑               |
                                                              └── (on fail) ──┘
                                                              max 3 retries
```

Each agent writes its output to disk and returns only a file reference to the Orchestrator.
**Never pass code through chat between agents.**

---

## 4. Hard rules (non-negotiable)

- **One feature at a time.** Never mix changes from different features in the same session.
- **Never declare done without passing verification.** Run `./init.sh` before closing; it must exit green and the checks in `docs/verification.md` must pass (no console errors in Chrome for UI changes).
- **Code lives in `vite-extension/src/`**. Respect the modular conventions in `docs/conventions.md` and `CLAUDE.md` (HTML/CSS/JS separated, panel in ES modules, npm deps are allowed and bundled locally by Vite, no remote code). Never edit `outputs/` for new features — it is frozen legacy.
- **All output goes to disk.** Agents write files; the Orchestrator only receives references like `done -> progress/impl_<feature>.md`.
- **Human must approve the spec before implementation starts.** The Spec-Writer handles this gate — the Orchestrator waits.
- **If you don't know something, look in `docs/` or `CLAUDE.md`** before making it up.
- **If `./init.sh` fails, stop.** Log the blocker in `progress/current.md` and mark the feature as `blocked`.

---

## 5. Session close (mandatory)

1. Run `./init.sh` — must exit green.
2. Append the contents of `progress/current.md` to `progress/history.md`.
3. Reset `progress/current.md` to the base template.
4. Verify no untracked temporary files are left behind.
