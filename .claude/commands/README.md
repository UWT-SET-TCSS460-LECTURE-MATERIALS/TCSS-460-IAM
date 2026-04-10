# Claude Code Commands

Custom slash commands for Auth² development.

## TODO Tracking (`/todo`)

| Command | Purpose |
|---------|---------|
| `/todo/all` | Full dashboard — active work, backlog summary, recent changelog |
| `/todo/add` | Add a new item to active work or backlog |
| `/todo/backlog` | Display the full `planning/BACKLOG.md` |
| `/todo/changelog` | Display the full `CHANGELOG.md` |
| `/todo/update` | End-of-session reconciliation — check off completed items, update changelog, refresh active work |

### Tracking layers

1. **Active Work** — in Claude memory (MEMORY.md), tracks in-flight branches and current focus
2. **Backlog** — in `planning/BACKLOG.md`, prioritized by P1-P4 + Known Issues
3. **Changelog** — in `CHANGELOG.md`, Keep a Changelog format

### Typical session flow

```
/todo/all          # start of session — see where things stand
# ... do work ...
/todo/update       # end of session — reconcile what was done
```

---

## General Commands

| Command | Purpose |
|---------|---------|
| `/understand` | Analyze and restate the current request before starting work |
| `/plan` | Create a detailed implementation plan with phases and steps |
| `/explain` | Educational explanation for professors and CS students |
