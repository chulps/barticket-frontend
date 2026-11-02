# In-app app-update history

Notifications shows a separate **App updates** list, not shift activity. Closing
a shift, signing out/in or reloading does not create or delete release records.
It does not send Web Push, play sound, or send email.

## What counts

This records frontend production app builds published by the Pages pipeline.
Independent API-only deployments are not included. A version is the short public
frontend commit SHA. **Built** is the build timestamp in JST, not the exact time
Pages completed deployment. Feature notes are reviewed bilingual summaries
authored in `src/api/releaseNotes.ts` and keyed to the exact production commit
SHA. They do not alter the append-only public ledger. When a new frontend release
ships, add a concise English/Japanese title and feature bullets for that exact
commit in the same change; use the generic label only when a release has no
reviewed note. Do not infer features from an arbitrary commit message. Existing
releases are described only when their merged changes have been verified.

A candidate entry is only visible when its artifact is actually served by Pages.
Failed/unpublished candidates are never a history source. Workflow run + attempt
is one build identity; serving/reloading it does not duplicate it. A new build
of a previous commit is a new release, not deletion of later records.

## Trust and persistence

Production workflows are serialized (cancel-in-progress: false). The build reads
the already-public ledger from the fixed canonical HTTPS Pages origin with no
cache, a timeout and no redirects. Schema/ID/SHA/date/size are validated. No
browser/API bearer token, new secret or write permission is used.

The newest **first-attempt successful** workflow artifact is a regression guard.
Its history must be present unchanged in the live ledger; it is not merged into
a candidate. Rerun artifacts are not trusted as proof: rerun-all can replace an
artifact even if that new deployment never succeeded. Missing, conflicting or
regressed history fails rather than silently resets records.

Bootstrap requires the exact last pre-feature baseline
6381501fce8c9b9f2ec41976598f67eea2733457, an absent ledger in its artifact, and
HTTP 404 from the live ledger endpoint. If another frontend release lands first,
update this baseline only after confirming it is the actual pre-feature deployed
commit. Do not change it as a shortcut around a post-rollout failure.

All records are carried forward. Display starts with five entries and “Show older
updates”; no record expiration. Explicit 10,000-entry / 2 MiB limits fail with
migration guidance, never trim rows. Artifact retention (90 days) is a
recovery-source limit, not history expiration. Existing asset continuity
independently requires a prior production artifact.

## Rollbacks and recovery boundaries

Use a new main revert/build for normal rollback; it keeps history and adds the
reverted version.

**Do not rerun an old deploy-only job as routine rollback.** It can temporarily
publish old history. The next build detects regression against the verified
first-attempt source, but cannot detect every release lost from a history that
was only ever recorded by successful reruns. Arbitrary manual deployments,
deleted/expired sources and legacy/rerun-only sequences are not guaranteed
reconstructible. This is not a transactional backend audit log.

If verification fails:
1. Do not delete the ledger, change the bootstrap SHA, disable validation or
   claim an empty list is successful recovery.
2. Inspect current live history and exact artifact/status/attempt records from
   actual successful production releases. Never use failed/preview candidates.
3. Recover only verifiably published records in an explicitly reviewed recovery
   change. Preserve IDs/timestamps; report missing evidence, never fabricate.
4. Re-run tests and deploy a fresh main build after recovery authorization.

No production test notifications or business writes are needed. Unit tests use
synthetic ZIP/TAR ledgers; browser fixtures intercept metadata/API traffic.
