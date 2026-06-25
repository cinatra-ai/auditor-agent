# Auditor Agent

A generic content auditor that improves another agent's output before it ships. Point it at any content bundle, choose the audit skills you want it to apply, and it surfaces concrete, accept-or-dismiss suggestions for human review. Accepted edits are applied deterministically — what you see in the review surface is exactly what lands in the result.

**Install:** add `@cinatra-ai/auditor-agent` as a dependency in your Cinatra workspace, then enable it in your agent configuration. No additional infrastructure is required.

**Configure:** pass the package name of the parent agent (`parentPackageName`) and, optionally, an explicit list of skill identifiers (`skillIds`). When `skillIds` is empty the agent resolves whichever audit skills are installed for the parent agent automatically.

**Usage:** invoke the Auditor Agent flow with a `data` object (the content bundle produced by your parent agent) and the parent's package name. The agent resolves skills, runs them against the data, pauses at a human review screen so you can accept or dismiss each suggestion, then applies the accepted patches and returns the mutated data bundle.

**Troubleshooting:** if no suggestions appear, verify that audit skills are installed for the parent agent or pass explicit `skillIds`. If the review screen does not appear, check that the `@cinatra-ai/auditor-agent:review` field renderer is registered in your workspace.

## Capabilities

- Run skill-driven audits over any content bundle produced by another agent
- Resolve skills automatically from the parent agent or accept an explicit skill list
- Surface accept-or-dismiss suggestions through a human-in-the-loop review screen
- Apply accepted edits deterministically, exactly as previewed in the review surface
- Return the audited content bundle ready for the next step in your workflow
