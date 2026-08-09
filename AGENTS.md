<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Shipping Buddy delivery workflow

## Operating model

Shipping Buddy uses a manager/executor workflow for durable implementation work:

- The primary Sol agent is the Scrum Master and technical owner. It owns requirements, architecture, issue scope, work packages, review, Git state, and the two status documents.
- `shipping_luna` is the default production-code executor. Give it one bounded issue package at a time.
- `shipping_tester` independently verifies completed Luna work and may edit tests only.
- `shipping_explorer` is a persistent read-only companion for supplementary code, dependency, and reference research.
- `shipping_docs` updates durable documentation only after behavior has been verified.
- `shipping_sol_fallback` is limited to one unusually difficult package after a Luna blocker is evidenced.

For a durable goal, major redesign, or explicit request to use Luna, use the Heavy route in `agent_docs/workflow/heavy_route.md`. For small independent changes, use the Medium route in `agent_docs/workflow/medium_route.md`. Simple questions need no workflow overhead.

## Responsibility boundaries

- Sol must directly read foundational project documents, decision-critical framework documentation, and central integration boundaries. Delegation does not replace technical ownership.
- Start production implementation with Luna only. Add the tester after Luna returns a coherent self-checked increment.
- Workers never modify Git state or `agent_docs/project_progress.md` / `agent_docs/latest_session_work.md`.
- Do not run multiple write-heavy workers on overlapping files.
- Subagent assignments must be self-contained, bounded, and include outcome, ownership, acceptance criteria, source paths, validation, protected areas, and return format.
- A worker may inspect adjacent code to diagnose a blocker but must request a scope amendment before editing outside its assigned surface.

## Project documentation

Durable project context lives under `agent_docs/`:

- `project_overview.md`: product goal, customer workflow, and major constraints.
- `project_core_tech.md`: important technologies, versions, and technical invariants.
- `project_structure.md`: current and target module ownership.
- `project_progress.md`: active goal, issue/checkpoint status, evidence, and next action.
- `project_diary.md`: lasting decisions, discarded approaches, and lessons.
- `latest_session_work.md`: compact cross-session handoff.

Only Sol edits `project_progress.md` and `latest_session_work.md`. Update durable documentation from verified facts, not tentative reasoning or raw logs. Never delete a main project document without warning the user and receiving explicit confirmation.

## Core product principles

- Design for an adult novice: direct language, obvious choices, and no unexplained packaging jargon.
- Use a question-by-question customer workflow. Do not return to a monolithic planner page.
- Existing and saved boxes are primary sources; flat sheet stock is an advanced path.
- Surface dimensions in inches with practical quarter-inch checkpoints. Keep canonical geometry in millimetres.
- Treat fit geometry, transformation feasibility, and structural validation as separate facts. Do not invent retained strength claims.
- The uuuulala folding-cardboard tutorial is the renderer parity baseline. Establish that baseline before adding custom visual styling or post-processing.
- Common/existing-box assembly must remain distinct from cut-and-fold workflows.
- Generated cuts, instructions, animation, and exports must share one authoritative playbook so they cannot drift.
- Preserve unrelated projects and existing user changes.

## Git and execution safety

- Sol owns staging, commits, branches, pushes, issues, and pull requests.
- Never use blanket destructive cleanup or automatic `git add .` without first reviewing exact status and ignored/generated payloads.
- One implementation issue maps to one `codex/issue-N-slug` branch unless the user directs otherwise.
- A new child issue requires reproduction evidence, acceptance criteria, a parent link, and Scrum Master priority before it enters scope.
- Long logs belong in a task-specific directory beneath the Windows temporary directory, not the repository.
