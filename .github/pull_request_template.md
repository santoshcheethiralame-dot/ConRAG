## Summary

<!-- What does this change, and why? Link the issue it closes, if any. -->

## Changes

-

## Checklist

- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass
- [ ] `EMBEDDING_PROVIDER=hash npm run eval -- --check --no-write` passes
- [ ] Tests added or updated for the changed behaviour
- [ ] Documentation updated where behaviour changed (generated files regenerated, not hand-edited)
- [ ] Database changes are a **new** numbered migration, enforced in the database and proved in `tests/db.test.ts`
- [ ] If judge, scoring or retrieval changed: before/after `npm run eval` numbers are in the description

## Evaluation impact

<!-- Only for judge, scoring or retrieval changes: before / after precision, recall, disclosure rate. Otherwise write "none". -->
