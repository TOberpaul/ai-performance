# Project telemetry

For each implementation package, record one outcome under its epic in `.codex/context-packages.json`. Record the title, initial story-point estimate and start time before implementation, and keep them when following up. Use the existing ticket for rework on the same outcome.

Add each implementation, feedback or handoff turn exactly once under `subtasks` with its real session ID, turn ID and measured work duration in seconds. Record completion in `completedAt` and explicit acceptance separately in `acceptedAt`.

Use `npm start -- --codex-history` to inspect this project's data. The local token log is ignored by Git.
