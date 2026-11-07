# Public-project inspiration

Public README/manual material reviewed on 6–7 November 2026 informed the study flow and responsive navigation. Review scope is recorded below; sample apps were not run as part of this research.

| Source reviewed | Ideas considered | Labwise implementation |
| --- | --- | --- |
| [Anki manual: Studying](https://docs.ankiweb.net/studying.html) | Deck scope, recall before reveal, self-rating, due queues | Source selection, stable flashcard sessions, reveal-before-rating, and due/forgotten queues |
| [Compose Samples README: Reply and JetNews](https://github.com/android/compose-samples) | Adaptive navigation, readable content, light/dark presentation | Phone bottom navigation, tablet rail, wider question/teaching layout, and dark mode |
| [Now in Android README](https://github.com/android/nowinandroid) | Topic-led browsing and a consistent app structure | Collection/subject filters, persistent navigation, and a shared study shell |
| [Material Android navigation-bar documentation](https://github.com/material-components/material-components-android/blob/master/docs/components/BottomNavigation.md) | Three to five labeled top-level destinations on compact screens | Five phone destinations with a visible selected state; Saved remains accessible from the header |
| [Mnemosyne README](https://github.com/mnemosyne-proj/mnemosyne) | Flexible card selection and learning-progress visualization | Scoped review filters, effort history, and subject progress |
| [Moodle README](https://github.com/moodle/moodle) | General overview of a learner-centered study environment | Considered the broad learning workflow; detailed Moodle quiz/question-bank documentation was not reviewed |
| [AnkiDroid README](https://github.com/ankidroid/Anki-Android) (earlier release research) | Active recall, review statistics, night mode | Flashcard ratings, review progress, and dark mode |
| [FSRS4Anki README](https://github.com/open-spaced-repetition/fsrs4anki) (earlier release research) | Separating content, scheduling, and recorded history | A separate tested scheduler with explicit deterministic intervals; FSRS and its optimizer are not implemented |

No project code, graphics, branding, assets, or deck content was copied. Labwise's interface, scheduling logic, and teaching notes were implemented independently. The three source PDFs were supplied by the user. Research did not add a runtime framework, account service, or remote AI dependency.
