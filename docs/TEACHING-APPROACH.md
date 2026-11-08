# Teaching approach

Owner's rules, in priority order. If a rule here conflicts with the kickoff file, this file wins.

## 1. Fun first, learning through fun

- She plays before she is told anything. The Learn stage opens with a toy she can poke (a slider, a switch, a bulb), then names what she just saw.
- Every mission has a story and a silly stake. Not "make the LED dimmer": "your robot's eyes are scaring the lunar mice, dim them to 30%".
- Failure is funny, never a penalty. Burnt LEDs "retire early". No lives, no timers that punish, no red crosses.
- Include "fix the broken robot" puzzles as well as blank builds.
- Small rewards often: a patch per project, a star per tier, a celebration line from the mentor.
- No flashing faster than 3 Hz. Colour is never the only signal.

## 2. Plain words for a 13-year-old

- Reading age 11-12. Short sentences. Space-themed examples.
- Never use a term before it is defined. First use links to the glossary.
- Mentor bubbles are short, never walls of text.
- Level 1 uses everyday words ("push", "flow", "squeeze"). Real terms (voltage, current, resistance) are introduced with the everyday word beside them, then used on their own.

## 3. Difficulty slides, but is never impossible

Three layers, all optional to use and none of them blocking:

**Inside a mission: three tiers**
- *Training*: fewer parts, wider target, extra guidance.
- *Standard*: the main mission.
- *Stretch*: a bonus twist after Standard.
- If she fails twice, offer Training. If she passes first time, offer Stretch. Offered, never forced. Finishing any tier counts as finishing the mission; Stretch earns the extra star.

**"I don't get it": a four-rung ladder, always one tap away**
1. Say it again in simpler words.
2. Say it with a picture or an everyday comparison.
3. Worked example, step by step, with different numbers.
4. "Show me": the mentor does the mission while she watches, then she does a smaller version herself.
Each rung also exists as the hint ladder in a mission (nudge, bigger clue, worked example). Wrong answers teach: the mentor explains what the circuit is actually doing.

**Never-stuck guarantee**
Every mission has a path to the finish. No dead ends, no unwinnable states (a burnt part can be repaired, a board can be cleared, a starter circuit can be loaded). If content has no fix for "she is stuck", that is a content bug.

## 4. She chooses the level, any time

Five levels, picked by the learner (or a teacher), switchable at any moment. **Nothing is locked.**

| Level | Name | Stage | Feel |
|-------|------|-------|------|
| 1 | Cadet | Year 7-8 | Plain words, small steps |
| 2 | Pilot | Year 9-10 | Real equations and units, still friendly |
| 3 | Commander | GCSE | Rearranging, standard form, bigger puzzles |
| 4 | Specialist | A-level | Circuit laws, proper working-out |
| 5 | Chief Engineer | University | Node voltages and the full maths |

A level changes the *register* of what she sees, not whether she may see it:

- words and equation formality in lessons
- depth of the maths check
- what the workshop's readouts show (planned for the sandbox step: plain words at 1, units and V = IR checks at 2, power and standard form at 3, Kirchhoff checks at 4, node-voltage table at 5)

Content is written as variants keyed by level. `pickForLevel()` (`src/progress/levels.js`) chooses the exact level, else the nearest lower one, else the nearest higher. When it had to fall back, the UI says so plainly ("This is the Commander version. Chief Engineer is coming.") instead of pretending.

**Phase 1 scope call:** Arc 1 lessons are authored for levels 1-3. Levels 4-5 are fully selectable and the workshop already responds to them, but their lesson variants are later-phase work. Honest, not hidden.

## 5. More than one person

- Several candidates can share one browser. The start screen is "Who's flying today?". Each has their own robot, candidate ID, level and progress.
- **Guest mode** is for teachers and visitors: full access, level choice included, nothing ever saved. It does not touch anyone's real progress and disappears on reload or "Leave guest mode".
- Deleting a candidate always asks first.
- Privacy is unchanged: everything stays in this browser. No accounts, no analytics.

## 6. The nine stages of a project

1. **Briefing**: story, 1-2 bubbles.
2. **Learn**: plain-English concept in 3-6 chunks, opening with a toy.
3. **Equation card**: equation, symbols, units, rearranged forms. Saved to the Formula Book.
4. **Worked example**: fully solved, different numbers from the mission, step by step with a Next button.
5. **Try one**: small guided question, instant feedback, no penalty.
6. **Mission**: the build, limited parts, live readout, three hint tiers, three difficulty tiers.
7. **Debrief**: "why it worked", tied to her actual numbers.
8. **Python task** where the project has one, with its own mini-briefing.
9. **Maths check**: 2-3 questions using the circuit she just built.

## 7. Author checklist (every project)

- [ ] Opens with something to poke before any explanation
- [ ] Every term defined before use
- [ ] Mission has a silly stake
- [ ] Training, Standard, Stretch tiers
- [ ] Four "I don't get it" rungs written
- [ ] Hint ladder written (nudge, clue, worked example)
- [ ] Level variants for the levels in scope, plus a note on which are missing
- [ ] Every worked example verified by running the numbers in code
- [ ] A "stuck" path exists
- [ ] Beginner playtest: could someone who has never seen a circuit finish from Learn and Worked Example alone?
