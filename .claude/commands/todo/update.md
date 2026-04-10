End-of-session update. Review the current conversation to identify what was accomplished, then update all three tracking layers.

## File locations

- **Backlog:** `planning/BACKLOG.md`
- **Changelog:** `CHANGELOG.md`
- **Active work:** Claude memory (MEMORY.md "Active Work" section)

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

### 4. Update memory — Active Work

Update the "Active Work" section in MEMORY.md to reflect current state:
- What branches are in progress and their status
- What's blocked and on what
- What's ready to deploy/merge
- Remove items that are fully shipped

### 5. Show summary

Display what was updated:

```
SESSION UPDATE

Completed:
- [list of items marked done]

Added to backlog:
- [list of new items added]

Changelog:
- [brief list of new entries, or "No changelog update needed"]

Active work:
- [current state of in-flight branches]
```

## Rules

- Convert relative dates to absolute dates
- Do NOT mark items complete that weren't actually completed in this session
- Do NOT remove TODO items — mark them `[x]` so history is preserved
- Keep changelog entries concise — one line per item
- If unsure whether something was completed, ask the user before updating
