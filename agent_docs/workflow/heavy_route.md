# Heavy route

Use this route for the active Shipping Buddy goal and other multi-issue deployments.

## Roles

- Sol is Scrum Master and technical owner. It decides scope, reads central code/docs, writes work packages, reviews integration boundaries, owns Git/GitHub, and maintains the two status documents.
- Keep one `shipping_explorer` companion for read-only supplementary investigation.
- Start each production package with one `shipping_luna` executor.
- Start `shipping_tester` only after Luna hands off a coherent self-checked increment, unless independent test research is genuinely parallel.
- Use `shipping_docs` only after behavior is verified.
- Use at most one `shipping_sol_fallback`, and only after an evidenced Luna blocker or when the package cannot reasonably be narrowed.

## Work-package contract

Every initial package is self-contained and no longer than 400 words. Include:

1. Task ID and outcome.
2. Exact ownership/edit surface.
3. Acceptance criteria.
4. Documents and source paths to read.
5. Validation commands or observable evidence.
6. Protected/out-of-scope areas.
7. Required return format.

Follow-ups contain only the delta: task/iteration, changed evidence, affected criterion, and next action. Workers may not expand their own edit scope.

## Execution loop

1. Sol records the bounded package in `project_progress.md` and assigns Luna.
2. Luna implements a coherent increment and runs the smallest relevant check.
3. Sol reviews critical hunks, contracts, and integration boundaries without duplicating Luna's entire analysis.
4. The tester adds or updates deterministic coverage, then runs focused and broader required gates.
5. Production defects return to the same Luna thread. Test defects stay with the tester.
6. Sol reconciles evidence, Git status, issue status, documentation needs, and the next package.

Only new evidence justifies another repair iteration. Never weaken checks or claim an unrun gate passed.

## Lifecycle and blockers

- Worker events are `proof`, `defect`, `blocker`, `replacement`, or `final` and must include concrete evidence.
- One evidence-free worker response receives one concise retry. A second consecutive evidence-free response triggers replacement.
- If both original and replacement fail, Sol announces a takeover before implementing anything itself.
- A blocker report includes the failed step, exact evidence, completed changes, affected criterion, and required authority or decision.
- Wait on active workers in useful intervals; do not poll the filesystem merely to prove that an agent started.

## Status and Git

- `project_progress.md` is updated when a package starts and when its evidence is reconciled, not after every micro-step.
- `latest_session_work.md` is a compact handoff, not a live scratchpad.
- Workers never stage, commit, branch, push, or edit GitHub issues.
- Sol reviews exact status before staging only intended files. No blanket cleanup or destructive reset.
- A package is complete only when its acceptance evidence is current after the last relevant change.
