Show current active work only. No backlog, no changelog, no commentary.

## Steps

1. Read the memory files in the Claude memory directory for any "Active Work" entries
2. Check `git branch` for feature branches (exclude `main`)
3. Display as:

### Active Work
| Item | Status |
|------|--------|
| ... | ... |

If there are feature branches, show them. If there are noted blockers or next steps, show those.

If there is no active work, say so: "No active work items. Use `/todo/add` to add one."
