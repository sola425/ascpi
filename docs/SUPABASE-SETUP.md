# Enable optional account sync and private friend quizzes

The Supabase backend and client adapters are prepared and tested locally. **Live owner acceptance is still required.** Local study, solo Frenzy and progress exports continue to work without an account. Account sign-in needs the project, SQL, public configuration and confirmed users. Hosted email confirmation and password recovery are optional additions for the pilot; they require the email setup below.

## 1. Create the project and apply the migration

1. Open your project at [Supabase](https://supabase.com/dashboard), or create one in your own organization if needed.
2. Open the project's **SQL Editor**. Paste and run the complete [setup.sql](../supabase/setup.sql) once; it combines both migrations and all 2,993 matching question metadata rows in one transaction. Developers can rebuild it with `node supabase/build-setup.mjs supabase/quiz-seed.sql`. The sources are [202611070001_progress.sql](../supabase/migrations/202611070001_progress.sql), [202611070002_challenges.sql](../supabase/migrations/202611070002_challenges.sql) and [quiz-seed.sql](../supabase/quiz-seed.sql).
3. The combined file already includes the matching app release's quiz-registry seed. Its rows populate `public.labwise_quiz_questions` with only question ID, subject, source ID, answer index, option count and the release's SHA-256 content digest. It contains no question text, explanations or PDFs. A friend quiz cannot start until enough questions from the app's digest are registered.
4. Confirm that `public.labwise_progress`, the progress RPCs, `public.labwise_quiz_questions` and the seven challenge RPCs exist. Rerunning the migrations preserves stored progress and live quiz snapshots.

Only the migrations and release seed belong in the live SQL Editor. Files in `supabase/tests/` create a fake Auth schema for a disposable local database and must not be applied to a Supabase project. Keep `labwise_private` and `pg_catalog` out of the exposed API schemas; expose the normal `public` RPCs only.

The table stores one progress document per Auth account. Its `user_id` comes from `auth.uid()` inside the RPCs. Row-level security denies access to other accounts. Anonymous users receive no table or RPC privileges. Deleting an Auth account cascades to that account's cloud progress.

Writes compare the expected revision while holding a database row lock. Concurrent first saves also handle the unique-key race. A stale write returns `accepted: false` and the latest document; it never overwrites that revision. Mutation policies require a transaction-local marker that the write RPC sets and restores, so ordinary direct REST inserts and updates cannot bypass this check. Keep `pg_catalog` out of the exposed API schemas, and do not expose arbitrary SQL or configuration-setting RPCs.

## 2. Choose the pilot or hosted email setup

For a closed pilot, the owner can manually confirm test users in Supabase's **Authentication → Users** dashboard. Confirmed users can sign in with their chosen credentials without SMTP or a hosted callback. Leave `redirectUrl` empty for that pilot. This route does not verify signup-email delivery or password recovery, and the app must not advertise those flows as ready.

For email links:

1. Enable **Email** sign-in under Auth providers. Keep email confirmation enabled for real users.
2. Publish [auth-callback.html](../auth-callback.html), [auth-callback.js](../auth-callback.js), [auth-callback.css](../auth-callback.css), `sync-config.json`, `sync-config.js` and `supabase-client.js` together at the app's public HTTPS site. The Return to Labwise link expects the app's `index.html` beside them.
3. The intended GitHub Pages callback is `https://sola425.github.io/ascpi/auth-callback.html`, with Site URL `https://sola425.github.io/ascpi/`. **The files are prepared; Pages hosting has not been configured or verified here.** First check the deployed page is reachable.
4. Under Auth **URL Configuration**, set that Site URL and add the exact callback URL to the allowed redirect URLs. Put the same reachable HTTPS callback URL in `sync-config.json.redirectUrl` and rebuild the APK.
5. Configure your own SMTP provider before inviting general users. Supabase's default sender is restricted and rate limited. An initial email pilot may use an address already authorized by that sender, such as an organization/team address; verify its delivery and callback first.

The callback strips the URL fragment immediately, then verifies its access token with Supabase before showing success or the password form. Recovery requires two matching passwords of at least 12 characters, updates the password, and ends the temporary recovery session. It never signs the app in automatically or stores credentials. The user returns to Labwise and signs in on their original device. This also works when the original device is Android; no custom email deep-link scheme is required.

The callback uses only local assets and a CSP restricted to this project's Supabase origin. If you deliberately change projects, update the approved origin in both the callback HTML policy and JavaScript as well as the public configuration. Tokens and passwords stay out of progress documents, exported backups, links, referrers and logs.

## 3. Supply the public project configuration

In the project's Connect dialog or Settings, find:

- **Project URL**, such as `https://your-project.supabase.co`.
- **Publishable key**, beginning `sb_publishable_`. A legacy `anon` key is also supported.

These two values identify the public client and may be included in the app's assets. **Never use a secret key, service-role key, database connection string or database password in the app or chat.** The client rejects secret/service-role keys. User access and refresh tokens belong only in the separate session store.

Update the repository's `sync-config.json` with the public values, then deploy the web assets and rebuild the APK so both clients use the same project. Use an empty `redirectUrl` for the manually confirmed closed pilot, or the verified HTTPS callback for hosted email flows. Account sync still requires each user to opt in and sign in.

```json
{
  "enabled": false,
  "url": "https://YOUR_PROJECT.supabase.co",
  "publishableKey": "sb_publishable_REPLACE_WITH_PUBLIC_KEY",
  "redirectUrl": "https://your-app.example/auth-callback.html"
}
```

Replace the example values and set `enabled` to `true` after the chosen owner setup is ready. The pilot's empty redirect does not require hosting.

The adapter sends the public key in the `apikey` header. Signed-in operations additionally send that user's access token as `Authorization: Bearer …`. Public keys are never used as bearer tokens. No service-role credential or frontend SDK dependency is needed.

## 4. Verify the live owner setup

Use accounts and email addresses that you control:

1. Create an account, open its confirmation email and sign in. Check that the cloud status confirms a successful sync.
2. Sign in to the same account in a second browser profile or device. Confirm that saved questions, review history, reading positions, study preferences and game progress arrive.
3. Make different changes on both devices, including while one is offline. Reconnect and synchronize. Confirm that independent changes survive and replaying a sync does not add game XP again.
4. Sign out and verify local study still works. Check password recovery through the hosted callback.
5. With a different account, confirm that the first account's cloud progress is absent.
6. Create a private friend quiz, share its eight-character code and join from one other account. Both players must see the same ordered questions. A third account must be refused without seeing either player's data.
7. Answer correctly, answer incorrectly, let a question expire, reopen an active question and read its explanation before choosing Next. Verify that deadlines persist, repeated requests award no duplicate points, three misses end a round and equal final scores produce a draw.

These are owner acceptance steps; no automated test sends email, creates a remote account or modifies a live project. Monitor your project's email, database and API limits in its dashboard.

## Stored data and boundaries

The version 1 cloud document has only these top-level fields:

| Field | Progress metadata |
| --- | --- |
| `version`, `clock` | Schema version and merge clock |
| `records` | Review counters, schedules, separate MCQ / recall / game results |
| `saved` | Saved-question state, including removals |
| `reading`, `prefs` | Reading pages and study preferences |
| `events` | Deduplicated study activity |
| `game` | Game counters and content-free run metadata |
| `frenzy` | ID-keyed summaries of completed solo Frenzy runs |

The coordinator validates the full progress schema before upload and after download. SQL checks the version, top-level allowlist, metadata container types and an 8 MiB document limit, including for maintenance writes that bypass RLS. Question text, choices, explanations, PDF files, imported question-bank contents, audio, transcripts, passwords and authentication tokens are excluded from the sync document. Local unfinished study sessions remain on their device.

A timeout can occur after the server commits a write. The adapter does not automatically repeat writes or rotating refresh requests. The coordinator reads and merges the current revision before another save. If a document exceeds the server's size limit, keep a local progress export and resolve the limit before resuming cloud sync.

## Private friend quiz behavior

Friend quizzes use separate private tables for two members, the selected question IDs and snapshotted keys, per-player turns and submitted answers. They do not upload a whole progress profile. There are no public profiles, email addresses, searchable player lists or global leaderboard. Members receive their own current question/feedback and the friend's score, hearts, answered count and completion state. Their latest twenty challenges can be loaded on another device after signing into the same account. Reentering their own invitation code resumes the existing membership without adding another player. Direct client reads of the registry or private tables are denied; the authenticated RPCs check membership using `auth.uid()`.

The creator selects subjects, sources and 10 or 20 questions. The server randomly selects matching registered IDs once, and both players receive that order. Registry maintenance does not change an existing quiz's snapshotted keys. Invitations use eight cryptographically random base32 characters (40 bits), and the invitation and quiz expire seven days after creation. Each account is limited to five creation attempts per hour window and twenty per day window, plus thirty invitation attempts per hour window and one hundred per day window. Failed invitation/content requests also count. Expired records remain private until owner retention cleanup or account deletion; deleting either member's Auth account removes the associated private quiz data.

Each player proceeds independently, concurrently or later within the expiry period. Opening the first turn starts its thirty-second server deadline. Reopening it preserves that deadline. A correct answer earns 100 points; a wrong answer or timeout loses one of three hearts. The server records the first answer/timeout under a row lock, so duplicate and stale submissions cannot change it. Explanations have no clock. Explicit Next starts the following question, or opens the final result after three misses or the question limit. The final explanation remains available in feedback before Next. There is no speed bonus, and equal scores are a draw.

The timer is enforced when the server processes the request, including network travel and any request waiting time. A device countdown is only a display of the server deadline. Closing the app, losing connectivity or delaying a request does not pause an opened friend question. An elapsed deadline is settled on the next poll or action, exactly once. A null answer asks the server to settle an elapsed deadline; it cannot assert an early timeout. On an uncertain network result, read the current turn before allowing another action. Polling the summary updates scores without starting another question.

This is a friendly quiz, **not a secure exam**. The offline APK already contains the questions and answers; friends can inspect or share them. Server grading prevents client-asserted scores and timer resets, but it cannot prevent looking up answers, account sharing or outside assistance. Question text and teaching are displayed from the matching local app release rather than sent to the database.

## Local verification

From the repository directory:

```sh
node tests/supabase-client.test.js
node tests/duel-client.test.js
node tests/auth-callback.cjs
node supabase/tests/run-postgres.mjs
```

The client tests use mocked HTTP responses and cover Auth normalization, email confirmation, password recovery, refresh-token rotation, session verification, connection failures, request/body timeouts, conflicts, challenge response privacy, fixed RPC whitelists, invalid input and sanitized errors. Callback browser tests use Chromium with mocked Auth responses for confirmation, recovery, expiry, URL stripping, privacy, configuration and connection failures; they send no email and contact no live project.

The database command requires Node.js and a working local Docker daemon. It starts the official `postgres:17-bookworm` image in a disposable container with networking disabled and no published ports, runs the SQL, and removes the container. Its passwordless test-only database is reachable only through `docker exec`. It tests actual PostgreSQL grants and RLS with representative Supabase roles and a minimal `auth.uid()` fixture, payload rejection, account isolation, deletion cascade, simultaneous first saves, concurrent updates, private registered grading, three-heart and question limits, expiry, rate limits, overlapping invitation claims, duplicate answers, timeout races and migration reruns that preserve data. Override `LABWISE_POSTGRES_IMAGE` only to use another trusted, compatible PostgreSQL image.

These commands pass locally. Hosted Supabase Auth, PostgREST/API gateway behavior, SMTP delivery and the final live project configuration still require the owner acceptance steps above.

Protocol and authorization references: [Supabase Auth OpenAPI](https://github.com/supabase/auth/blob/master/openapi.yaml), [official Auth client signup/recovery implementation](https://github.com/supabase/auth-js/blob/master/src/GoTrueClient.ts), and [Supabase row-level security documentation](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/postgres/row-level-security.mdx).
