End-of-session update. Review the current conversation to identify what was accomplished, then update all three tracking layers.

## File locations

- **Backlog:** `planning/BACKLOG.md`
- **Changelog:** `CHANGELOG.md`
- **Active work:** `active_work.md` in the Claude memory directory (has frontmatter — preserve it)

## Steps

### 1. Identify completed work

Scan the conversation for:
- Files created or edited
- Commits made (note hashes)
- Features implemented or bugs fixed
- Design decisions made
- Planning docs created or updated

### 2. Update BACKLOG.md

- Check off completed items with `[x]`
- Move items between sections if their priority changed during the session
- Add any new items that emerged from the work (e.g., follow-up tasks, newly discovered issues)

### 3. Update CHANGELOG.md (if applicable)

Only update if a version-worthy change was made (feature, fix, breaking change). Add entries under the appropriate version section following Keep a Changelog format. If no version section exists for current work, create an `[Unreleased]` section.

### 4. Update active work memory file

Read the current `active_work.md` from the Claude memory directory. Then **write the entire file back** using the Write tool with updated content. The file MUST have this structure:

```markdown
---
name: Active work tracker
description: Current in-flight branches, blockers, and next steps — updated by /todo:update at end of session
type: project
---

## Active Work

- **item** — description
```

Update to reflect current state:
- What branches are in progress and their status
- What's blocked and on what
- What's ready to deploy/merge
- Remove items that are fully shipped
- Convert relative dates to absolute dates

### 5. Update MEMORY.md index (if needed)

If the one-line summary for `active_work.md` in MEMORY.md no longer fits, update it. Usually this is not needed.

### 6. Show summary

Display what was updated:

```
═══════════════════════════════════════════════════════
SESSION UPDATE
═══════════════════════════════════════════════════════

Completed:
- [list of items marked done]

Added to backlog:
- [list of new items added]

Changelog:
- [brief list of new entries, or "No changelog update needed"]

Active work:
- [current state of in-flight branches]

───────────────────────────────────────────────────────
```

## Rules

- Convert relative dates to absolute dates
- Do NOT mark items complete that weren't actually completed in this session
- Do NOT remove TODO items — mark them `[x]` so history is preserved
- Keep changelog entries concise — one line per item
- If unsure whether something was completed, ask the user before updating
- Always use the Write tool to save `active_work.md` — do not just edit MEMORY.md
