Add a new TODO item. **Defaults to the active work list in memory**, not the backlog.

The user's input: $ARGUMENTS

## Routing rules

1. If the user says "backlog" → add to `planning/BACKLOG.md` in the appropriate section
2. If the user does NOT say "backlog" → add to the `active_work.md` file in the Claude memory directory
3. If the item clearly seems like a long-term/backlog item (future feature, production hardening, UX polish) but the user didn't say "backlog" → **ask the user** whether it should go in active or backlog. Don't assume.

## Adding to active (memory)

1. Read the current `active_work.md` from the Claude memory directory
2. Add a concise `- **bold title** — description` entry under the "## Active Work" heading
3. Preserve the frontmatter (the `---` block at the top of the file)
4. Write the updated file back using the Write tool
5. Display the updated Active Work section

## Adding to backlog (BACKLOG.md)

1. Read the current `planning/BACKLOG.md`
2. Determine the best-fit section (P1 Pre-Launch, P2 Hardening, P3 Features, P4 Future, Known Issues)
3. If the user specifies a section or priority, use that. Otherwise, infer from context.
4. Add as `- [ ]` entry, bold key phrases, consistent with existing style
5. Display ONLY the section where the item was placed

## General rules

- Clean up wording to be concise
- Convert relative dates to absolute dates (e.g., "Thursday" → the next Thursday's date)
- Do not add commentary or suggestions — just confirm what was added and show the relevant section
