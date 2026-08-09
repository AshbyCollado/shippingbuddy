# Workflow provenance

This project-local workflow was independently adapted from the concepts in
[`viettran-edgeAI/codex_workflow`](https://github.com/viettran-edgeAI/codex_workflow/tree/41fce1ef7d1cce09528f7d5e7d4ec7723db61146), reviewed at commit
`41fce1ef7d1cce09528f7d5e7d4ec7723db61146` on 2026-08-09.

The reference repository did not contain a license at the reviewed commit. Its files were therefore not copied wholesale. Shipping Buddy uses an original, project-scoped implementation of the manager/executor, bounded work-package, explorer, tester, and durable-handoff ideas.

Deliberate compatibility changes:

- Project-local `.codex/agents/` and `.codex/config.toml` follow current official Codex configuration instead of mutating global user configuration.
- Existing Next.js-generated `AGENTS.md` instructions are preserved.
- No automatic deletion of project files.
- No automatic blanket staging or commits.
- Windows temporary paths replace assumptions about `/tmp`.
- Agent concurrency is capped for the available local session capacity.
