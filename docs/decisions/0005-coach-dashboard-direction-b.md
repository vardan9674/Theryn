# 0005 — Coach dashboard redesign follows Direction B (one table, client beside it)

- Date: 2026-09-08
- Status: accepted

## Context
The current coach web app has seven tabs with 9px labels, no home screen, an athlete picker that disappears once a client is selected, plan editing hidden behind a small pencil chip, unexplained labels ("7d Volume", "Avg Session"), and no way to export or share a plan. The owner wants a CRM a non-technical coach can open and understand on both phone and laptop, plus an Export to Excel button for a client's plan.

Three directions were mocked up on the "Theryn Coach Dashboard" design canvas: A (Today home, then client page), B (one client table with the selected client in a side panel), C (six large action buttons). The owner chose B.

## Decision
The coach app is rebuilt around four top-level areas: Clients, Plans, Payments, Messages.

- Clients is home: a table with four columns a coach checks daily (Last workout, This week, Payment, What to do). Clicking a row opens that client beside the table on laptop, or as a full page on phone, with tabs Plan, Progress, Body, Payments.
- Plan editing shows the week as seven columns on laptop and one day at a time on phone, with Sets, Reps, Weight boxes and a per-exercise note.
- Export to Excel lives on the client's plan, on each plan in the library, and inside the plan editor. It previews the sheet, offers two options (include last lifted weights; add empty columns to fill in), and can save the file, send it into the client's chat, or share it. One sheet per training day; columns Exercise, Sets, Reps, Weight, Coach note.
- Payments is a manual ledger with plain status words (Paid, Due Friday, Late by 1 day).
- Secondary text moves from #585858 to #8A8A8A for legibility; every phone control is at least 44px.

## Consequences
- The seven coach tabs in `src/App.jsx` (`COACH_TABS`) collapse to four; Body and Progress become tabs inside the client page rather than global tabs.
- Needs a spreadsheet writer on the client (a small xlsx library) and, on native, the Share plugin for the file. No server change.
- Mockups are the reference for Roadmap task 1.3 (split App.jsx); the split should produce `components/coach/` files that map one-to-one to the screens on the canvas.
- Directions A and C are kept on page 2 of the canvas. A's "needs you today" sentence may return later as the first filter chip on the table.
