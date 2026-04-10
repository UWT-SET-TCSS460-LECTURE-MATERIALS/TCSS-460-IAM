Add a new TODO item. **Defaults to the active work list in memory**, not the backlog.

The user's input: $ARGUMENTS

## Routing rules

1. If the user says "backlog" → add to `planning/BACKLOG.md` in the appropriate section
2. If the user does NOT say "backlog" → add to the "Active Work" section in MEMORY.md
3. If the item clearly seems like a long-term/backlog item (future feature, production hardening, UX polish) but the user didn't say "backlog" → **ask the user** whether it should go in active or backlog. Don't assume.

## Adding to active (memory)

1. Read the current MEMORY.md from the Claude memory directory
2. Add a concise `- **bold title** — description` entry under "Active Work"
3. Display the updated Active Work section

## Adding to backlog

1. Read the current `planning/BACKLOG.md`
2. Determine the best-fit section (P1 Pre-Launch, P2 Hardening, P3 Features, P4 Future, Known Issues)
3. If the user specifies a section or priority, use that. Otherwise, infer from context.
4. Add as `- [ ]` entry, bold key phrases, consistent with existing style
5. Display ONLY the section where the item was placed

## General rules

- Clean up wording to be concise
- Convert relative dates to absolute dates (e.g., "Thursday" → the next Thursday's date)
- Do not add commentary or suggestions — just confirm what was added and show the relevant section
