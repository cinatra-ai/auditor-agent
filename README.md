# Auditor Agent

A generic content auditor that improves another agent's output before it ships. Point it at any content bundle, choose the audit skills you want it to apply, and it will surface concrete, accept-or-dismiss suggestions for human review. Accepted edits are applied deterministically — what you see in the review surface is exactly what lands in the result.

## Capabilities

- Run skill-driven audits over any content bundle produced by another agent
- Surface accept-or-dismiss suggestions through a human review surface
- Apply accepted edits deterministically, exactly as previewed
- Plug in custom audit skills to enforce your own quality standards
- Return the audited content bundle ready for the next step
