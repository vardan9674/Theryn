# Theryn project docs

Everything about this project that is not code lives here, in git, so it is tracked.

| File | What it is | When to update |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current map of the system, derived from source | When a component, table, or flow is added or removed |
| [ROADMAP.md](ROADMAP.md) | Phases, tasks, and their status | Whenever a task starts, finishes, or is dropped |
| [WORKLOG.md](WORKLOG.md) | Dated log of what was done and found, newest first | Every working session, before the commit |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Where to look to see what the backend is doing | When a new log source or query is useful |
| [decisions/](decisions/) | One file per architectural decision, numbered | When a choice is made that would be expensive to reverse |
| [../CHANGELOG.md](../CHANGELOG.md) | User-facing changes per release | On every release |

## The rule

If it is not written in one of these files or in a commit message, it did not happen.
Every session ends with a WORKLOG entry and a commit.

## Conventions

- Branch per change: `feat/…`, `fix/…`, `chore/…`. Main only moves by merge.
- Commit messages follow Conventional Commits: `fix(scope): what changed`.
- Migrations are named with timestamps by `supabase migration new <name>`; never hand-number them.
- Decisions use the template in `decisions/0000-template.md`.
