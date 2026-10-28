# Working as a team

One session building a creature fills up: footage frames, joint angles, palette
notes and QA logs all end up in one context, and the session ends up grading
its own work. The team splits it up. An **orchestrator** (the session that
loaded this skill) runs the reference loop and judges. **Specialists** do the
work, each with a clean context and its own files.

Use it for anything past the first rough build, and always once an owner's
note says something specific is wrong ("it's the limbs"). A first Specimen
can be built by one session; switch to the team for the rounds of steps 6
and 7.

## The roles

| Agent             | Owns                                                                                                                                       | Done when                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| orchestrator      | The contract, the briefs, the owner, `docs/<ANIMAL>_VISUAL_DIRECTION.md`, `npm run check`, commits                                         | The owner says it moves like the real one (P-19) and approves the look                               |
| `critter-footage` | `docs/<ANIMAL>_FOOTAGE_LOG.md`, `qa/tools/footage/*<animal>*`, the measurements of footage **and** model, the side-by-side video           | The same measures printed for both, each checked on an overlay; the video is made                    |
| `critter-motion`  | `<animal>-motion.ts`, the world, and the limbs' or body's **shape and movement** (rig, limb geometry, twist, depth): everything that moves | Every footage measure inside its range, the motion checks and soak at zero, nothing jumps            |
| `critter-look`    | Colour, light, texture, shading, the body's painted surface, the habitat's look, inside the approved board                                 | Frames that meet the look bar (SKILL.md step 8); then the orchestrator, then the owner, accepts them |

Two splits that look natural and fail:

- **Gait and IK apart.** Where a foot lands and how the joints reach it are
  one problem; two owners blame each other's half. Motion owns both.
- **"How it's drawn" apart from "how it moves" for limbs.** A paddling foot's
  feathering is a motion value (its twist) that you only see through its
  drawn width. Whatever moves belongs to motion, including the geometry that
  shows the movement. Look owns the surface, not the shape.

The footage agent measures the model as well as the footage, so the agent
changing the motion never edits the code that grades it.

## Files

Working files live in `reports/<animal>/team/` (gitignored). Durable results
go where they always go: the footage log, the motion sheet, the visual
direction, the spec.

```
reports/<animal>/team/
  contract.md              # the shared ground truth, owned by the orchestrator
  round-1/
    brief-footage.md       # what each specialist is asked to do this round
    brief-motion.md
    brief-look.md
    report-footage.md      # what each one says back
    report-motion.md
    report-look.md
    review.md              # the orchestrator's verdict and notes for round 2
  round-2/ …
reports/<animal>/footage/  # frames, overlays, tracks, side-by-sides (footage)
reports/<animal>/look/round-<n>/  # full-scene and tap frames (look)
```

One report per specialist per round, written **by the specialist**, in full.
Claude Code doesn't let a subagent write report files, so the specialist
returns its full report as its final reply and the orchestrator saves it to
`report-<role>.md` **verbatim**, with only a dated line on top saying what it
rechecked. Never condense or rewrite a report; the orchestrator's own words go
in `review.md`. A second pass in the same round is appended under a dated
heading rather than starting `report-footage-1b.md`. Name every output folder
in the contract, so nothing lands where no one looks.

A specialist starts with nothing but its agent definition, `CLAUDE.md` and
its brief. **If it isn't in the brief or the contract, the specialist
doesn't know it.** Write briefs as if to a capable stranger.

## The loop

1. **Write the contract** (template below) from the footage log, the motion
   sheet, the visual direction and the owner's notes. Quote the owner word
   for word. Fix the body plan; the specialists build on it.
2. **Brief and dispatch.** Write each brief, then start the agents with the
   Agent tool (`subagent_type`: `critter-footage`, `critter-motion`,
   `critter-look`). The prompt is short: the brief's path and "read it,
   do it, write your report there". Order in a round:
   - footage first when the evidence is missing or a measure is needed that
     doesn't exist yet (a per-frame width curve across a stroke);
   - then motion and look **in parallel**, since they own different files;
   - then footage again to measure the new build and make the side-by-side. If
     anything changed after look took its frames, re-take them on the final
     build first, so the frames, the measures and the videos all show the
     same build.
3. **Review.** Read the reports, not the diffs first. Check each claim:
   rerun the comparison table, watch the side-by-side at real speed (Q-R8),
   look at the full scene before crops (Q-R4). Write `review.md` **every
   round, the last one included**: what passed, what didn't and why, in
   terms the next brief can act on, and what goes to the owner.
4. **Show the owner** the side-by-side and frames (P-19). Their words go into
   the contract verbatim.
5. **Next round.** Continue an agent with SendMessage when its context is
   still useful (it remembers what it tried); start a fresh one when it has
   gone stale or is going in circles. The brief is enough to restart from.
6. **Stop on purpose.** Put a stopping rule in the contract from round 1: a
   cap on rounds (three is plenty for a Specimen), and once a part is signed
   off by the owner it is frozen. When the cap nears, name the **last round**
   and fix its list of items in the contract. After it, the owner answers
   **ship or not**. Anything still imperfect goes in a known-issues list in
   the project's README. Another round happens only for items the owner
   names, capped to them.

The orchestrator **never edits creature code**. If a fix is small and
obvious, it still goes in a brief. That keeps the judge independent and its
context lean.

## Rules for specialists

- **Stay in your files.** Anything you need changed elsewhere goes in your
  report under _Requests_; the orchestrator routes it. A change to the body
  plan (lengths, proportions, joint positions) is always a request.
- **Don't relent, but don't self-certify.** Keep iterating until your finish
  line is met by numbers (footage, motion) or until you have frames worth
  reviewing (look). Then report. Never write "approved", "matches" or "done"
  for a thing only a person can judge.
- **Find the cause before changing a number** (SKILL.md step 6). A report
  that says "raised X from 0.4 to 0.9 and the measure now passes" without
  saying why it was wrong is sent back.
- **Run targeted checks only** (`qa:swim`, `qa:gait`, your measure script).
  The orchestrator runs `npm run check` and commits. If a build fails in a
  way that has nothing to do with your change, another agent may be building:
  wait and run it again before digging.
- **Report honestly**: what you verified, what you didn't, what's still off.

## Same checkout, not worktrees

Specialists work in the main checkout, kept apart by file ownership. A git
worktree starts from the last commit, so it can't see uncommitted work (a new
`packages/<animal>` that hasn't been committed is simply missing). Use
worktree isolation only once the animal's code is committed, and then merge
each specialist's branch back yourself.

## Without subagents

In a tool with no subagents, keep the files and the loop and run the roles
one after another: for each brief, start from a clean context (a new chat or
session), give it only the agent definition, `CLAUDE.md` and the brief, and
let it write its report. Slower, same division of work.

## Templates

### contract.md

```markdown
# <Animal> — team contract

Round: <n> · Size: <Specimen | Vignette | Study> · Board: r<k> (<approved | not approved>)

## The act

<One sentence: which animal, doing what, for what motive.>

## Owner's notes, verbatim

- <date>: "<exact words>"

## Evidence

Footage log: docs/<ANIMAL>_FOOTAGE_LOG.md, grade <A|B|C>. What may be called
measured: <…>. Known limits: <frame rate, tilt, …>.

## Body plan (frozen this round)

<Lengths, proportions, joint and root positions, in body lengths. Cite the
motion sheet.>

## Ownership

| Files | Owner |
| ----- | ----- |
| …     | …     |

## Shared interfaces

<What the renderer reads from the world (state fields, functions), and what
must stay stable while both work.>

## Output folders

<Where each specialist writes frames, tracks and videos.>

## Stopping rule

Cap: <n> rounds. Frozen (owner signed off): <parts>. Last round's fixed list:
<items, once named>.

## Finish lines

- Motion: <measures and ranges, checks>
- Look: <what frames, at what sizes, judged against what>
- Footage: <measures needed, overlays>
```

### brief-<role>.md

```markdown
# Round <n> — <role>

## Read first

- reports/<animal>/team/contract.md
- <only the files this task needs>

## The problem

<What is wrong, with evidence: the owner's words, the numbers, the frames.>

## What to do

<The task. Say what is in scope and what isn't.>

## Done when

<The finish line for this round, checkable.>

## Report to

reports/<animal>/team/round-<n>/report-<role>.md
```

### report-<role>.md

```markdown
# Round <n> — <role> report

## Result

<One paragraph: met the finish line or not.>

## What I changed and why

<Each change with its cause, not only its value.>

## Evidence

<Comparison tables, overlay or frame paths, command output.>

## Not verified

<What you couldn't check.>

## Still off

<What you'd do next.>

## Requests

<Changes needed outside your files, or to the body plan.>
```
