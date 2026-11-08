# Decisions

Newest first.

## 2026-11-08

- **Levels are chosen, never gated.** Owner request: she can pick uni-level at any point. Five levels (Cadet, Pilot, Commander, Specialist, Chief Engineer). A level changes register, not access. Stored per profile.
- **Scope call: Arc 1 lessons authored for levels 1-3 only in Phase 1.** Writing four more registers of every lesson would multiply the content volume (the real cost per kickoff section 10). Levels 4-5 are selectable now and the workshop readouts respond to them; their lesson variants are later phases. Owner can overrule.
- **Missing level content falls back to the nearest lower level and says so.** `pickForLevel()`. Never silently shows the wrong level, never shows nothing.
- **Difficulty slides inside a mission via Training / Standard / Stretch, plus a four-rung "I don't get it" ladder and a never-stuck guarantee.** Owner request: "gets harder but never impossible". See TEACHING-APPROACH.md.
- **Profiles instead of one learner.** Several candidates per browser; each has own robot, ID, level, progress, workshop board. Max 12.
- **Guest mode is memory-only.** Nothing written to storage, so a teacher can play freely without touching her progress; verified by a byte-for-byte storage test and an e2e test. After a reload the app returns to whoever was active before the guest started.
- **No PINs on profiles.** Kids' app in a family browser; a PIN adds friction and false security. Deleting needs a confirm step instead. Revisit if teachers want it.
- **Store v2 with automatic v1 migration.** The first build's save (the owner has already used the live site) becomes a profile with the same candidate ID.

- **Wires and closed switches are 1 mOhm, not ideal.** Ideal zero-ohm sources make loops of wires singular, and loops are normal in a sandbox. Cost: ~1e-6 relative error (closed switch + 900 Ohm on 9 V reads 9.99999889 mA). Test tolerances for those cases say so.
- **Short circuit = battery delivering more than 10 A.** Follows from the 1 mOhm rule (a shorted 9 V battery shows ~9000 A). Not a graph search, so it also catches very-low-resistance paths, which is the right teaching behaviour.
- **Solver reports, never mutates.** A burnt LED still reports the current it would carry; the caller decides what burnt means. Keeps the solver pure and testable.
- **LED: piecewise linear, Vf per colour, 2 Ohm series, 30 mA limit, 1 uV hysteresis.** Without hysteresis, two LEDs in series flip-flopped at exactly Vf and failed to converge (found by the series-LED test). Smooth exponential model rejected as unnecessary for the target level.
- **Island grounding instead of a leakage conductance (gmin).** Each floating island gets its own 0 V reference, so open circuits read exactly 0 A, not nanoamps, and the matrix stays well conditioned.
- **Battery current is reported as delivered current (out of +).** Positive when discharging, so Python `circuit.current("B1")` reads naturally for a learner. Documented in COMPONENTS.md.
- **Random-network KCL tests added beyond the kickoff list.** 600 seeded random networks (resistor-only and with LEDs) must satisfy KCL and converge. Guards against hand-case-only coverage.

- **Bootstrap commit straight to `main`.** The repo was empty, so no `main` existed to merge into. First commit (`.gitignore` only) went directly to `main`; everything else goes via branches.
- **Canonical repo name `Project-jadzia`.** GitHub redirects `project-jadzia` to `Project-jadzia`. Pages URL is case-sensitive in the path, so config uses the canonical name.
- **Playwright viewports: laptop plus iPad (gen 7) on Chromium.** Owner said laptop, mainly tablet. Chromium only to keep CI fast.
- **Progress store is DOM-free with injected storage.** Lets unit tests run in plain node with no browser.
- **Pages workflow stages only `index.html`, `config`, `src`, `content`.** Keeps tests and docs out of the deployed site.
- **Candidate ID format `<initials>-<6 chars>`, no I/O/0/1.** Avoids look-alike characters on a tablet screen.

- **Sandbox model separate from the engine.** `src/sandbox/model.js` holds the board (grid, parts, wires) and builds a netlist; the solver never sees the board. Drawing is in `glyphs.js`.
- **Parts are 4 grid steps long with terminals `.a`/`.b`; wires are 1 mOhm components.** Same wire model as the solver, so loops and short circuits behave.
- **Burnt parts stay burnt until Repair.** Burnt parts are left out of the netlist, so the circuit opens. Never a dead end: Repair, Clear and the starter circuit are always available.
- **Readouts depend on level, not on lesson.** Level 1 says push/flow in plain words; each level up adds one idea (V/I/R, power, Kirchhoff, node table). Switching level is instant.
- **Tapping anywhere places an armed part.** Found in e2e: requiring an empty-background tap made placing fail on a tablet when the spot held a part.

- **Level adapts, but the learner decides.** Auto level is on by default: 3 clean answers in a row moves up one level at the next stage, 2 struggles moves down. A banner says so with "Keep my level". Switching auto off turns the moves into suggestions. Picking a level by hand always wins and resets the counts. Owner asked for both adaptive and manual.
- **Numbers are generated, not written.** A question carries a template (variables per level, derived values, constraints, an answer expression). Each play draws new numbers, so replays are not the same test. A small expression parser is used instead of eval().
- **Replay means new numbers and a new scenario.** Missions carry 3 scenarios (story, battery, targets); a replay cycles to the next one.
- **Every mission must be provably winnable.** Each scenario and tier ships a solution board, and a unit test solves it with the real solver. The start board must not already meet the goal. This is what stops an unwinnable mission shipping.
- **Never stuck in a question.** Wrong twice reveals "Show me the answer", which unlocks Next. A mission can be skipped, but earns no patch until its goal is met.
- **Python stages are data until step 6.** Content already has task, starter code and expected output rules, so authoring is not blocked.

- **Python stage rules (`expect`) for step 6.** Each Python stage lists rules the runner checks: `{kind: "code-contains", text}`, `{kind: "output-contains", text}`, `{kind: "any-output"}`. Wrong output never blocks: after two tries the learner can carry on.
- **Themes are colour variables plus a few effects.** All colours come from CSS variables, so a new theme is one block in `themes.css`. A unit test fails if a theme misses a variable or an animation sits outside the reduced-motion query. T2 and Quantum Leap use the look (colours, scanlines, grid, colour bar) but no logos or artwork. Internal use only.
- **Theme is kept per browser and per profile.** A candidate's own choice wins when they are active; guests use the browser's.
- **Missions set the palette battery.** A scenario's battery voltage is what the palette places, so an empty-board mission still has the right numbers.

## Python sandbox and the panel (step 6)

- Pyodide 0.26.4 pinned in `config/app.config.json`, loaded from jsDelivr on first use, in a module Web Worker. Chosen so a runaway loop is stopped by terminating the worker (5 s limit). `?pyodide=<url>` overrides the base URL (used for testing and self-hosting later).
- Python never touches the page. Her code gets `panel` and `circuit` objects that record actions; the page applies them. Each run starts with fresh globals.
- Checks (`expect`): `code-contains`, `output-contains`, `any-output`, `panel`. A failed check never blocks Next.
- Dashboard: on-screen first (KISS, cheap). Empty until built; one part per finished project, derived from `profile.completed`, so nothing extra to store. Physical hardware version stays deferred (iPad Safari has no Web Serial or Bluetooth).
