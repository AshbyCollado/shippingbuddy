# Medium route

Use this route for one bounded change that benefits from durable context but not a worker pipeline.

- Sol performs implementation, verification, and documentation directly.
- A single read-only `shipping_explorer` companion may investigate supplementary context.
- Divide work into inspection, implementation, verification, and review stages only when those stages add clarity.
- Batch independent read-only operations, but keep dependent edits, Git operations, and shared-state checks sequential.
- Preserve unrelated user work and document genuine blockers with evidence.
- Apply the same Git safety and acceptance standards as the Heavy route.
- Use the Heavy route instead when the user asks for Luna, the work spans multiple issues, or independent verification materially improves reliability.
