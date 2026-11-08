# Decisions

Newest first.

## 2026-11-08

- **Bootstrap commit straight to `main`.** The repo was empty, so no `main` existed to merge into. First commit (`.gitignore` only) went directly to `main`; everything else goes via branches.
- **Canonical repo name `Project-jadzia`.** GitHub redirects `project-jadzia` to `Project-jadzia`. Pages URL is case-sensitive in the path, so config uses the canonical name.
- **Playwright viewports: laptop plus iPad (gen 7) on Chromium.** Owner said laptop, mainly tablet. Chromium only to keep CI fast.
- **Progress store is DOM-free with injected storage.** Lets unit tests run in plain node with no browser.
- **Pages workflow stages only `index.html`, `config`, `src`, `content`.** Keeps tests and docs out of the deployed site.
- **Candidate ID format `<initials>-<6 chars>`, no I/O/0/1.** Avoids look-alike characters on a tablet screen.
