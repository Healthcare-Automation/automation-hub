---
name: hub-progress-tracker
description: Use after ANY meaningful change to Proxi automation hub (client dashboard) — shipped code, a deploy, a fix, a config or data change, or a blocker hit or cleared. Client-facing project, so the Notion To Dos board must reflect it. Not for reads, searches, planning, or routine intermediate steps.
---

# Proxi automation hub (client dashboard) — keep the client board current

This is a **client-facing** project. Work that is not on the board is work the client cannot see.

Board: **To Dos** → *Weekly To Dos* database (`38f23b11-7dfb-80c5-875e-ee8d2e71b9ba`)
<https://app.notion.com/p/To-Dos-38d23b117dfb80bdafb7daa96bd747d1>

## Non-negotiables

- **Update-existing rows only.** Never create or delete a row. Never touch Priority, Due, or Assign.
- **All writes through the helper.** No ad-hoc Notion API calls:
  `python3 ~/.claude/tools/notion_progress.py`
- **Always pass `--project automation-hub`** so the log line says which system changed.

## Notes: one sentence, max 200 characters

The helper rejects anything longer. `Latest Update` shows only the newest note; every note is also
appended to the page as a dated log line, so the board becomes a running history — that only stays
readable if each entry is short.

Write what changed and why it matters, in the client's words:

- Good — "Résumé check now runs before we pay for a profile, so fewer views are spent on duplicates."
- Good — "Automation paused: DentistJobCafe view allowance ran out. Resumes when it refills."
- Bad — "Fixed `_conserve_name_match` NameError in pipeline.py" (jargon, means nothing to them)
- Bad — a paragraph explaining the whole change (the log becomes unreadable)

No file names, function names, column names, IDs, or commit hashes.

## When to update

| Situation | Action |
|---|---|
| Starting substantive work on a board item | `--status "In progress"` + note |
| Shipped it — deployed, merged, fixed, live | `--status "Done"` + note |
| Milestone reached, or a blocker hit/cleared | note only, no status change |
| Reads, searches, planning, questions, intermediate steps | **nothing** |

## Procedure

1. `python3 ~/.claude/tools/notion_progress.py list` — see what is open.
2. If exactly one row clearly matches the work:
   ```
   python3 ~/.claude/tools/notion_progress.py update \
     --match "<distinctive keyword from the row title>" \
     --status "In progress" \
     --note "<one sentence, under 200 chars>" \
     --project automation-hub
   ```
3. If nothing matches, or several rows do, **skip and say so**. Never guess, never create a row.

## What counts as meaningful here

- A deploy that changes what the client sees
- New metrics, charts, or pages
- A number on the dashboard being wrong, and its correction
- The dashboard being unavailable, and its fix
