# Rendering styles — plan

Status: draft. This records the direction for the next critter-skill batch;
it is not approval for a new production look. Exploratory plates stay outside
`packages/` and are labelled sketches until a person approves the animal's
visual direction board under P-12 or P-16.

## The separation

The **world** decides what the animal does: its motives, body position, pose,
foot contacts and timing. A **rendering style** decides how that same pose is
drawn: its marks, colors, shading, outlines and explanatory annotations. A
style must not change the world, the footage measurements, hit targets or
motion checks. This is the practical meaning of keeping animation and
rendering separate.

The same world frame should be renderable in every selected style and in both
WebGL2 and Canvas 2D. The fallback may simplify surface detail, but it must
preserve the animal's silhouette, pose, contacts, motive cues and readable
colors. Style-specific color and material parameters belong in a shared style
description read by both renderers (A-6 to A-8); shared anatomy geometry stays
in TypeScript and shader geometry is generated from or checked against it
(A-7).

Changing the renderer or style does not trigger new animal research. Reuse the
species' footage log and motion sheet; revisit evidence only when the new work
adds an uncovered behavior or materially different condition.

## Exploratory catalogue

Private p5.js cockroach plates were the starting references. They used the
same measured tripod walk, but were sketches, not shippable renderers or
approved boards. (The plates and their contact sheet,
`docs/cockroach-board/sketch-style-contact.jpg`, left the repository on
2026-11-14; the sheet is in git history. Since 2026-10-27 the owner's chosen
look is the grainy flat style, `docs/FROG_VISUAL_DIRECTION.md`.)

This contact sheet is a visual reference only. Gait evidence remains the
250 fps footage and `docs/COCKROACH_FOOTAGE_LOG.md`; the sketch motion is
simplified and must not be used to infer timing or contact.

| Look                   | What changes                                           | Proposed role                                             |
| ---------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| Macro gloss            | Soft floor, reflective shell and grounded shadow       | Natural-material option                                   |
| Gouache                | Opaque, layered painted forms with softened edges      | Painterly option                                          |
| Graphite plate         | Pencil contours, hatching and specimen-sheet treatment | Monochrome option                                         |
| Ink and wash           | Ink contours with translucent washes                   | Painterly option                                          |
| Gait blueprint         | Diagram lines and measured footfall marks              | Explanatory option; annotations remain a separate overlay |
| Quote / specimen plate | Caption and editorial framing around the animal        | Page composition, not a material renderer                 |

Keep the options as a catalogue. A study may choose a subset that fits its
species and approved visual direction; the skill should not force every animal
into every look. Users can compare looks using one identical motion clip.

## Batch sequence

1. Finish the cockroach r2 full-scene and detail review; record the owner
   approval and any remaining observations.
2. Turn the p5.js plates into a compact, reviewable style board: one matched
   pose and walk in each candidate look, plus notes on strengths, limitations
   and what could transfer to another species. No production renderer changes
   in this step.
3. Define a small typed style contract that consumes shared world geometry
   and exposes palette/material data to both renderers. Keep the current look
   as the reference implementation. Do not add runtime dependencies.
4. Port two contrasting looks first: Gouache and Gait Blueprint. The second
   is treated as a diagram/annotation layer where appropriate, not as a claim
   that a technical overlay is a surface material. Preserve one unchanged
   motion recording across all comparisons.
5. Add a generic QA shot path for a named study, including full scenes before
   crops, and a style comparison sheet. Test cockroach first, then another
   animal to expose cockroach-only assumptions.
6. Implement `chain.ts`, `wave.ts` and `secondary.ts`; validate them on koi
   and turtle using footage logs. Keep these movement primitives independent
   of the rendering style work.
7. Update the skill and kit plan to explain the world/renderer split, the
   style catalogue, board approval, study sizing, tests and current limits.
8. Run a cold-start specimen with the revised skill and fix the gaps it finds.

## Completion checks

- Switching a style leaves the world state, pose, contacts and motive unchanged.
- Every selected style draws the same specimen in WebGL2 and Canvas 2D, with
  fallback differences recorded and reviewed.
- Style comparisons use the same seed, camera, scale, lighting intent and
  motion times; the board identifies any intentional differences.
- The cockroach and one different animal can use the shared style contract
  without copying renderer implementation code.
- Each production composition has its required approved board, and full-scene
  review precedes crops (P-12, P-16, Q-R4 to Q-R7).
- The full project checks pass; any timing result includes browser and machine
  conditions. No new runtime or development dependency is added without the
  owner's approval.

## Not in this batch

The full eleven-animal roster is not a release gate for this batch. Spider,
millipede, snake, gecko/newt, bird, dragonfly and earthworm remain later
coverage work. This batch proves a legged insect, a spine-driven swimmer, a
rigid-bodied walker and one unfamiliar cold-start specimen.
