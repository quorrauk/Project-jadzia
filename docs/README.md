# Orbital Candidate Programme

Interactive learning app for one learner (Year 8): electronics, Python and maths through 24 space-themed projects. Plain JS modules, no build step. Her name and progress stay in the browser only.

## Layout

- `index.html`, `config/app.config.json`
- `src/` engine, sandbox, python, lesson, mentor, progress, certificates, ui (built up over Phase 1)
- `content/` arcs, projects, glossary, formulas (JSON)
- `tests/unit`, `tests/e2e`
- `docs/` everything else; start with `STATE.md`

## Run locally

```
python3 -m http.server 8080
```

Open http://localhost:8080/. (Pyodide, from step 6, needs a server; opening the file directly will not work.)

## Docs

See `STATE.md`, `ROADMAP.md`, `DECISIONS.md`, `DEPLOY.md`, `TESTING.md`, `CHANGELOG.md`.
