# Project telemetry

The local `.codex/performance.sqlite` database holds tickets, usage and measurements. Use `npm run record -- list ticket` to inspect tickets and `npm run record -- ticket -` with JSON on stdin to create or update a ticket. Keep the database and its journal out of Git.

For each implementation package, record one outcome under its epic. Record the title, initial story-point estimate and start time before implementation and retain them during follow-up. Attach rework on the same outcome to the existing ticket.

Add each Codex implementation, feedback or handoff turn exactly once under the ticket's `subtasks` with its real session ID, turn ID and measured duration in seconds. Preserve existing subtasks when updating the array. Record completion in `completedAt` and explicit acceptance separately in `acceptedAt`.

Use `npm start` to inspect local data. Run `npm run import-history` to preserve available measurements before removing old Codex sessions.
