# Voice study in Practice and Quiz Show

Labwise 7.3.0 brings the voice learning loop to every ordinary Practice question, including longer questions and shared cases. Quiz Show remains a separate game. Both use installed device speech services and the existing teaching notes. There is no paid voice subscription, generative conversation service or automatic semantic grading.

## Start the Practice tutor

1. Open **Practice**, choose a question or start a session, then choose **Start voice tutor** near the question's top or in its tutor panel.
2. Hear the full displayed question, case and every option. Long text is spoken in chunks of at most 2,400 characters; the microphone opens only after the last chunk.
3. Say an option or answer, then confirm with “yes”. Say “no” to change it. This records one normal Practice answer, with the existing explanation layout retained.
4. Hear the result, selected-option reasoning, correct-option reasoning when needed, original book rationale and simplified teaching. Explain back what you learned, compare with the supplied recall answer, then rate your recall.
5. Say “next” or use the normal Next button. The session remains at your pace, without game hearts, points or lifelines. A hint reads the plain-language question; unanswered questions cannot be skipped by a game command.

The tutor uses the saved Practice session and has no Quiz Show question-length filter. It also supports questions without separate teaching by reading their original rationale. Images and readable tables remain available beside their questions; keep the screen nearby for those items. Opening a source or enlarged visual pauses speech. Typed commands, direct answer buttons and **Use answer-only voice input** remain available. Exam practice keeps its deferred feedback and does not show the tutor.

Only confirmed answers and self-rated review events enter normal progress. Conversation text and the tutor's temporary recall UI state remain in memory. Reload and navigation do not automatically resume a microphone.

## Start a Quiz Show round

1. Open **Play → Quiz Show** and choose your subjects and source collection.
2. Choose up to **5, 10 or 15 questions**. Audio-only selection uses short self-contained questions. Optionally include picture questions and keep the screen nearby.
3. Create the round, then choose **Start voice host**. First use explains speech-provider behavior. Android requests microphone permission when listening begins.
4. Hear the question and options, speak a choice such as “option B”, and confirm with “yes” when asked. Say “no” to choose again. A choice is not scored until confirmation.

Tapping choices, typed commands and manual controls stay available. A microphone or speech engine is not required for manual study. Nothing automatically starts listening when the app opens.

The device voice, locale and provider determine pronunciation and naturalness. Choose an installed voice and speaking speed in **Voice settings**. The default selects the best available device voice; installing suitable voice/language data can change what is available. A premium online natural-voice service can be added later, but it is not configured in this release.

## The Quiz Show learning loop

Each round starts with **three hearts**. Correct answers earn **100 points**; incorrect answers cost one heart. Three misses or the end of the chosen question set finish the round. Explanations and the final answer remain available, with no countdown.

Three lifelines are available once per round:

| Lifeline | Behavior |
| --- | --- |
| **50/50** | Removes wrong choices until two remain. A question already offering only two choices does not consume this lifeline. |
| **A clue** | Shows and reads the question in plain words. It does not reveal the answer. |
| **One skip** | Opens the explanation with no points and no lost heart. It is not recorded as an incorrect answer attempt. |

After every confirmed answer, the host explicitly says whether it is correct according to the book key. It explains the selected option and, when different, why the correct option fits. It reads the original book rationale, then the separately labelled plain-language explanation and memory hook. It asks you to explain back what you learned from the question or correction in your own words. After your response, it reads the supplied recall answer and asks whether you remembered the idea or want another look. A skipped question follows the same learning steps without being marked wrong.

**Recall is self-rated.** Labwise does not judge your reasoning with a generative model. “Got it” and “review again” are your ratings after comparison; they feed the normal review schedule. The book rationale remains separate from the simplified teaching and can also be repeated on request. Saying Next lets you move on at your own pace.

The knowledge climb shows your place and recorded outcomes. Points celebrate practice; they do not establish exam readiness or subject mastery.

## Commands and controls

Voice commands work while the host is listening. The app takes speaking and listening turns, so it does not listen over its own spoken question. Use the **Pause voice** button to stop speech at any time. Saying “pause” works during a listening turn.

| Say | Result |
| --- | --- |
| “Option B”, or the exact answer | Suggests that choice, then asks for confirmation. |
| “Yes”, “confirm”, or “final answer” | Confirms the currently proposed choice. |
| “No”, or “change my answer” | Cancels that proposed choice. |
| “Repeat”, or “read again” | Reads the question and remaining choices again. |
| “Fifty fifty”, “hint”, or “skip” | Quiz Show uses the corresponding available lifeline. Practice supports a plain-language hint, without game lifelines. |
| “Next”, or “continue” | Starts the next question after feedback, or opens the final result. Practice requires a confirmed answer first; Quiz Show also permits its skip lifeline. |
| “Why”, or “test me” | After feedback, starts a recall prompt. Before an answer, reads the Practice hint or uses the Quiz Show clue lifeline. |
| “Explain choices” | After feedback, reads the explanations of each option. Before an answer, reads the choices without revealing their explanations. |
| “Book rationale” | After feedback, reads the original source rationale. |
| “Reveal”, or “show answer” | During a recall step, reveals the supplied answer for comparison. |
| “Got it”, or “review again” | Rates your recall after comparison. |
| “Pause”, “stop”, or “take a break” | Stops the voice turn and keeps your place. |

The on-screen controls provide the same actions. The transcript editor accepts a typed answer or command when recognition is unavailable or a word was misheard. Unsupported or ambiguous answers do not silently become a scored choice.

**Listen after the host finishes speaking** can be turned off. The host can still read aloud, with listening started through its button. Recognition silence or provider errors leave manual controls available rather than keeping an indefinite listening loop running.

## Device behavior and privacy

Android uses `TextToSpeech` and a foreground `SpeechRecognizer` for the Practice tutor and Quiz Show. Supported browsers use their speech-synthesis and recognition APIs. Service availability and network requirements vary by device, language and provider.

- Microphone permission is requested only when foreground listening starts. Reading the app or speaking a question does not by itself request microphone access.
- Online device voices may send the **text being read**, including question or teaching text, to that voice provider. Recognition may send microphone audio to its own provider. Installed offline services can avoid those provider connections where supported.
- Labwise saves no audio or transcript history. Transcripts are temporary conversation state and are excluded from study progress, cloud sync and exports.
- Going into the background stops speaking/listening. Voice does not silently resume when returning; choose the voice control again.
- There is no always-on wake word or background microphone service. The Pause button remains available during speech.

The older input-only voice controls retain their external Android recognition-provider flow. In ordinary Practice they are under **Use answer-only voice input**. The tutor and Quiz Show add read-aloud and in-app listening; provider privacy behavior therefore differs from input-only recognition.

## Saved progress and pictures

An active Quiz Show round and its local summaries stay in a separate device-local session, like unfinished Practice and Flashcard sessions. The Quiz Show queue is not a version 4 progress-export field. Recorded answer and self-rated recall events enter the ordinary study history and can sync with an optional account. Authentication credentials never enter that history.

Picture questions keep the existing text question and choices, with the associated original photograph, chart or diagram attached and available to enlarge. Rationale-only pictures stay behind answer reveal. Audio-only rounds leave figure-dependent questions out; the host does not invent descriptions of an unseen cell, organism or diagram. Figure coverage and source limits are documented in [FIGURES.md](FIGURES.md).

## Verification

The engine, dialogue, speech adapter, native rules and responsive UI have automated checks. Mock speech services establish turn order, confirmation, cancellation and state contracts; SDK/JVM checks establish compilation and policy behavior. They do not establish actual voice naturalness, recognition accuracy, microphone behavior or Android device audio. Physical device and live account acceptance remain separate. See [VALIDATION-V7.3.md](VALIDATION-V7.3.md) for executed results.
