# Exam Challenge

Introduced in **Labwise 7.4.0**, Exam Challenge is an original prize-ladder game for learning from exam questions. It combines a longer review round with checkpoints and lifelines, while keeping the question, choices, original rationale and simplified teaching. It is separate from timed Frenzy, voice-hosted Quiz Show and deferred-feedback Exam practice.

## Start a round

Open **Play → Exam Challenge**. Select the source collection and subjects, then choose **50 or 100 questions**. The setup shows how many eligible questions are available and requires enough distinct items to fill that exact round. Questions are selected without repeats. A swapped-out question does not return in the same round.

There is **no countdown**. Original images, tables and charts remain attached to their verified questions. Answer at your own pace. After every answer, read the simplified explanation, every-choice reasoning and original book rationale before explicitly moving on. On the ending question, **See my result** opens the result after this review; the explanation is not skipped.

## Prize ladder and checkpoints

Correct answers climb toward **$1,000,000 in virtual study money**. These numbers have no cash value and do not represent an exam-readiness estimate. Every ten correct answers secures a checkpoint.

- A correct answer raises the current prize. Continue after reviewing its explanation.
- One wrong answer ends the round. The awarded amount is the last secured checkpoint, which is zero before the first checkpoint. The missed answer still has untimed teaching before results.
- After earning a prize, choose **Bank** to stop and retain the current amount, including progress above the most recent checkpoint.
- Completing all 50 or 100 questions correctly reaches the top of that mode's ladder.

The two round lengths have their own ladders and personal records. A 50-question record is compared with other 50-question results; the 100-question record is separate.

## Three lifelines

Each is available once per round:

| Lifeline | Behavior |
| --- | --- |
| **50/50** | Removes wrong choices until two remain, retaining the keyed answer. A question that already has only two choices does not consume this lifeline. |
| **A clue** | Shows the supplied plain-language question restatement. It uses existing teaching rather than generating a new answer. |
| **Swap question** | Replaces the current unanswered item with an unused reserve question from the selected scope. It does not count as a wrong answer. When the collection has no spare eligible item, swapping is unavailable. |

Lifelines do not remove the explanation stage. You can read all the teaching after committing an answer.

## Your record to beat

The welcome and result screens show personal best awarded prizes for the **50-question** and **100-question** modes, plus recent round results. The goal is to improve your own record and learn from the questions you miss. This is a personal device record, not a comparison with all users.

The device keeps a bounded history of up to 50 completed rounds. Best records remain available separately from that recent-history limit. Leaving the game keeps its current round locally so it can be resumed. Changing or removing a question collection can make an unfinished round unavailable; completed personal records remain separate from its question references.

## Storage, accounts and backups

Active rounds, personal best prizes and round history are local to the current device. Signed-in profiles use separate local namespaces so one user's challenge records are not presented as another user's records. These game records do **not** sync between phones and are **not included in the standard version 4 progress backup**, like the separate Quiz Show queue.

Recorded answer-learning events still enter ordinary study progress and can sync when account sync is enabled. They retain the app's separation between game activity and Practice accuracy. Standard progress exports can contain those learning events, without containing an active Exam Challenge, its prize records or its round history.

No new network route, remote service, database migration or Android permission is required for the local game. Clearing app data, uninstalling or losing the device can remove its local challenge records.

## Future online rankings

A global leaderboard is **not enabled in this release**. A future version could offer an opt-in online ranking, with separate 50- and 100-question categories and a chosen nickname. The current personal-record display must not be presented as a global rank.

That feature needs its own backend migration and release review. The server would need to validate supported question collections, enforce scoring and lifeline rules, and verify submitted results rather than trusting a client-supplied prize. Membership, access control, abuse controls, nickname moderation, retention and a way to withdraw from ranking would need explicit implementation. Private account identifiers, email addresses, answer history and study-profile contents should not be exposed in the public ranking.

The current offline bank contains the answers, so even a future server-validated leaderboard would remain friendly study competition rather than a secure proctored exam. No fake online rows or unverified global scores are displayed by the local version.

## Validation

See [7.4.0 validation](VALIDATION-V7.4.md) for the executed engine, screen and packaged-APK checks. Local and simulated checks should be distinguished from installation and physical-device acceptance. Practice voice tutoring, the audited source visuals and compatibility with the existing Friend Duel registry are retained in the same release; no live SQL change is required for that existing registry.
