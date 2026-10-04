# Admin Console — users & org hierarchy

A self-contained admin page for creating users and building the organization's structure.
No build step and no dependencies.

```bash
npm run admin        # serves ./admin at http://localhost:8080
npm run test:admin   # data-rule tests (node:test)
```

ES modules don't load from `file://`, so open it through any static server rather than by
double-clicking `index.html`.

## What it does

- **Users** — create, edit, delete; name, email, job title, role (Admin / Manager / Member),
  status (Active / Invited / Suspended), org unit and manager. Search and filter by unit
  (includes sub-units) or role.
- **Org hierarchy** — a collapsible tree of units (Company → Division → Department → Team).
  Add sub-units or members in place, rename, re-parent, and assign a unit head.
- **Reporting chart** — the manager → report tree, built from each user's "Reports to".
- **Export / Import JSON** — download the whole state, or load a file (validated first).

## Rules enforced (`store.js`)

- Emails are required, well-formed and unique (case-insensitive).
- No reporting cycles: a user can't report to themselves or anyone beneath them.
- No unit cycles: a unit can't move under itself or its own sub-units; sibling names are unique.
- The top-level unit can't be moved or deleted.
- Deleting a unit moves its sub-units and members up to its parent.
- Deleting a user moves their direct reports up to their manager and clears any unit they headed.

## Storage

Data lives in the browser's `localStorage`, so it is per-browser and not shared. `store.js`
holds all the data rules with no DOM dependencies, so wiring it to a real backend means
replacing `load()` / `persist()` in `app.js` with API calls and enforcing the same checks
server-side.
