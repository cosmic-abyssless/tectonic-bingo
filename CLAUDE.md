# Tectonic Bingo

## Glossary

`CONTEXT.md` defines the canonical domain terminology for this project (roles, board/tile/part/task structure, submissions, scoring, etc.). Read it when working on anything where the precise term or its rules matter — otherwise skip it.

## Test data generator

A feature ships with bingo generator support: whatever Players, Captains, Moderators or Admins create or do in it, a generated Bingo does too, through the real endpoints, so every generated Bingo shows it. Load the `generate-bingo` skill for how.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `cosmic-abyssless/tectonic-bingo` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
