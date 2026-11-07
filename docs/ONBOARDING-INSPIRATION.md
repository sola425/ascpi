# A first visit at the learner’s pace

Reviewed on 7 November 2026. These are official, public GitHub project documents used as a global reference set. Country origins were not researched, so no country attribution is made. The review concerns onboarding and learning interaction only; no question banks, clinical data or PDFs were opened for this work.

| Source and exact material read | What the source establishes | Labwise design decision |
| --- | --- | --- |
| **Shepherd:** [project README](https://github.com/shepherd-pro/shepherd/blob/main/README.md), read in full as raw Markdown, including the introductory description, **Shepherd**, **Using Shepherd**, supported browsers, project examples and license sections. Images, the live demo, linked tutorials and other linked pages were not opened. | Shepherd documents custom onboarding tours, training and journeys that can fit an application’s own interface. Its README does not establish that a particular tour improves retention or that its example projects use our interaction choices. | Keep a short, coherent journey within Labwise’s existing dialog and green/cream theme. Each of six steps explains one decision the learner will make. A small renderer uses the existing icon set and needs no tour library. |
| **Intro.js:** [project README](https://github.com/usablica/intro.js/blob/master/README.md), read in full as raw Markdown, particularly **How to use**, the ordered `data-step` description and the scoped presentation example; also documentation, build and license sections. Images, the linked demo and external documentation were not opened. | The project describes sequential product walkthroughs and an explicitly bounded presentation scope. The README mentions a separate right-to-left stylesheet; that is not evidence of translated Labwise content. | Make the sequence explicit with “Step n of 6,” Next and Back. Limit the tour to orientation; opening it never starts a round, microphone, sign-in or challenge. Skip, saved dismissal and reopening from settings are Labwise product decisions, not claims about this README’s defaults. |

The earlier learning reference review in [GAME-INSPIRATION.md](GAME-INSPIRATION.md) also informs the explanations → every choice → recall step. That document records the exact reviewed material for H5P, Oppia, Kolibri, GCompris, Exercism and Anki. Those sources were not fetched again for this change. Their documented patterns are reference ideas, not evidence that Labwise improves exam results.

## Implementation choices

- **Self-paced:** six steps, a visible position, explicit Next and Back, and an equally available Skip. No advance timer, autoplay, spotlight chasing or background action. The final Explore action closes orientation so the learner chooses where to begin.
- **Returnable:** completion and dismissal are separate device-local flags. Automatic first-use display respects both and existing learning progress; Study settings can open the renderer directly at any time. The host app owns storing flags and handling dialog close/Escape as dismissal.
- **Optional services:** the tour describes voice review and manual answer controls. It never starts voice input. With `syncAvailable: false`, it explicitly says account sync is not configured and directs the learner to progress backups. A configured build describes signing in as a choice.
- **Comfortable movement:** only the new step fades in and moves four pixels over 140 ms. Reduced-motion users receive no tour animation. No looping decoration, pulse or confetti is added.
- **Small screens and accessibility:** dialog height is bounded to 85dvh, content can scroll, the footer remains reachable, controls and close have a minimum 44-pixel target, each action has a text label, the step count is announced, and the body offers a programmatic focus target. Browser integration checks cover actual dialog focus, viewport fit and dismissal persistence.

All tour copy and layout are original. Existing Labwise SVG icons are reused; no external code, artwork, logos, screenshots, fonts or assets were copied, installed or bundled. No new third-party dependency is added.

## Renderer contract and validation

`onboardingStep(index, {syncAvailable = false} = {})` returns `{title, body, footer}` for the host’s `modal(title, body, footer)`. Numeric indices are truncated and clamped to 0–5; non-finite or non-numeric indices select the first step. `TOUR_STEPS` is frozen metadata. `needsOnboarding(flags, hasExistingProgress)` returns false for existing progress or `{completed: true}` / `{dismissed: true}`. It does not read storage or mutate flags.

The renderer emits only `tour-next`, `tour-back`, `tour-skip` and `tour-finish` actions. Its `.onboarding` root has `tabindex="-1"` for host-managed focus after a step change. `tests/onboarding.test.js` checks bounded steps, explicit controls and progress, learning coverage, unavailable-sync wording, first-use eligibility, browser-independent rendering, absence of autoplay or ambient side effects, and scoped reduced-motion CSS. The host app’s browser checks establish actual integration behavior.
