# Reusable movement library

Status: being assembled. This is the lookup page the critter skill checks
before asking for more research. It points to durable evidence and working
examples; it does not claim that a movement observed in one species gives the
exact timing or anatomy of another.

## How to reuse an entry

1. Match the requested animal to a movement family and a representative
   example below.
2. Reuse the source log, measurements and code primitive when species, action
   and conditions are relevant. Cite the source entry in the new motion sheet.
3. Copy the _mechanic_, not another species' numbers. For example, reuse the
   idea of a three-part footfall rhythm for a six-legged walker, but use that
   animal's measured phase and stride values when available.
4. Research only the uncovered part: a different movement mode, substrate,
   life stage or other condition likely to change the motion. Record why the
   existing entry did not fit.

Changing renderer, style, habitat art or page composition does not require
movement research when the animal's behavior and conditions stay the same.

## Movement families and coverage

| Family                          | Reusable example / source                                                                                             | What is supported now                                                                                                                                                                            | Gap before it can be reused broadly                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Walking and running on six legs | Cockroach; `docs/COCKROACH_FOOTAGE_LOG.md` and `packages/cockroach-floor/src/cockroach-motion.ts`                     | Measured gait phases, stride lengths, footfalls and body dimensions for _Nauphoeta cinerea_; `critter-kit/src/gait.ts` provides the footfall clock                                               | Add another legged species before treating its timing as general; current spider footage shows probing/climbing, not a steady walk                          |
| Hopping and landing             | Frog pond; `docs/FROG_FOOTAGE_LOG.md` and landing clip screened in `docs/FOOTAGE_SCREENING.md`                        | A published tree-frog study documents multiple initial contacts and their relation to perch diameter                                                                                             | Pond species is not identified; the source is qualitative context, not exact timing for lily-pad landings                                                   |
| Swimming with limbs             | Frog pond; `docs/FROG_FOOTAGE_LOG.md`                                                                                 | A comparative study supports kick, glide and recovery as broad phases and documents inter-species differences                                                                                    | Pond's exact timings remain guesses; identify its species or measure a clearly labelled composite against suitable footage                                  |
| Swimming with a bending spine   | Koi; `docs/KOI_FOOTAGE_LOG.md` (grade B, tracked with `qa/tools/footage/spine.mjs`), `packages/koi/src/koi-motion.ts` | Tail-beat rate, share of time beating, body bend and turn radius tracked from footage; the model is compared with the same measures (`spine-measure.mjs`); `critter-kit/src/swim.ts` (`qa:swim`) | Camera ~30° off vertical and the clip stops at 41 s: shapes are ranges, beat rate is noisy; straight-down footage at 50–60 fps would make them measurements |
| Slithering                      | Grass snake candidate in `docs/FOOTAGE_SCREENING.md`                                                                  | The screened clip shows local S-curves and head movement                                                                                                                                         | Current clip rarely shows the whole body; find a source suitable for a travelling wave and log the surface/mode                                             |
| Slow four-legged walking        | Turtle is rostered in `docs/CRITTER_KIT_PLAN.md`                                                                      | No reusable measured example yet                                                                                                                                                                 | Find and log footage; test a rigid shell and paddling separately from frog anatomy                                                                          |
| Many-legged waves               | Millipede is rostered; current candidate is rejected for gait in `docs/FOOTAGE_SCREENING.md`                          | Movement family identified; no validated gait data                                                                                                                                               | Find clear footage where legs are visible and measure the wave across body segments                                                                         |
| Flight and perching             | Bird/dragonfly roster entries; literature noted in `docs/CRITTER_PRIOR_WORK.md`                                       | Some general movement descriptions exist                                                                                                                                                         | Add species-level logs and separate wingbeat timing, folded glide/bounding, take-off and perch contacts                                                     |
| Burrowing / peristalsis         | Earthworm roster entry                                                                                                | No reusable measured example yet                                                                                                                                                                 | Find footage that exposes segment shortening/lengthening and burrowing direction                                                                            |

The first coverage milestone is not one animation per species. It is one
reliable, cited example for each major movement family, with the kit primitive
that expresses it and the conditions where that example applies. The frog's
family-level landing and swimming sources are indexed in
`docs/FROG_FOOTAGE_LOG.md`; exact pond timings remain unsourced. The roster
then tests whether those mechanics transfer to a different species.

## Evidence records versus reusable mechanics

- A **footage log** records what a source shows, under what conditions, and
  what was inferred from it. Keep one durable log per animal/source set and
  add entries only for evidence gaps (spec P-11).
- A **motion sheet** supplies the behavior and numbers for a particular
  specimen. It cites existing evidence and labels any extrapolation or guess.
- A **kit primitive** is reusable code, such as a footfall clock, a bending
  body chain or a damped fin. It takes parameters; it does not declare that
  those parameters fit every species.

These three layers let a typical new build start by selecting known movement
patterns and evidence. Research remains necessary only for new or mismatched
behavior, not for every rendering or every use of the skill.
