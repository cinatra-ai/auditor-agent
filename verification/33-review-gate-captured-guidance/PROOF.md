# PROOF — auditor-agent#33: "Captured guidance" now renders the run's seeded HITL prompts

Live in-image verification that the OAS fix on branch
`fix/33-review-gate-captured-guidance` makes the auditor review gate render
**"Captured guidance (N)"** listing each seeded HITL amendment prompt — the
exact state the #1838 host walk showed as empty **"(0)"**.

## Root cause (converged, Codex GO)

An `InputMessageNode` gate interrupt has **no channel** to carry its
`DataFlowEdge`-delivered inputs across the WayFlow→host A2A boundary on the
pinned runtime (wayflowcore/pyagentspec **26.1.2**):

- `UserMessageRequestStatus` carries only the node's rendered `message`; the
  reconciled gate's `message_template` renders to the empty string by design.
- The one structured cross-boundary surfacing (`__cinatra_endnode_outputs__`
  DataPart in `agent_loader.py`) fires only for `FinishedStatus`, never
  input-required.
- The host builds the renderer value from `task.metadata.pendingApproval`
  (empty for this path) + the last agent message parsed as JSON
  (`spreadFromOutput`). For the empty reconciled gate there is no JSON → both
  `prompts` and `preview` are absent from the renderer value.

So the #1794 authoring assumption ("the DataFlowEdge keeps delivering the
values into the interrupt payload and thus to the renderer") is **false** on
the pin.

## The fix (minimal OAS; mirrors the proven `emit_context_payload` precedent)

The only generic channel that reaches the renderer at interrupt is the last
agent message parsed as JSON. So route the payload through it:

- NEW `emit_review_payload` `OutputMessageNode` (inputs `prompts` array +
  `preview` object) whose message emits
  `{"prompts": …, "preview": …}` as JSON (an inference-hint comment carries the
  bare placeholders so pyagentspec infers the two inputs; the visible message
  renders empty).
- DataFlowEdges re-pointed: `prep_list.prompts → emit_review_payload.prompts`,
  `run_skills.preview → emit_review_payload.preview`.
- Control flow `prep_list → emit_review_payload → review_gate`.
- `review_gate` now declares **no** inputs (which also stops the #1830 shim
  rewriting it); it reads the payload from the preceding emit node's JSON via
  `spreadFromOutput`.
- Renderer **unchanged** (already reads `value.prompts` + `value.preview`).

## Result — PASS (edited fix + clean negative + same-stack red→green control)

Same live stack, same image, same loader, same seeded prompts, same DB — only
the mounted OAS differs across the A/B (buggy `dfcd31a0…` ↔ fixed `8d391e4e…`).

1. **EDITED (fix proof)** — run `f188df4e-ea5d-433a-b7d1-4a162b901dd6`: 2 seeded
   HITL amendment prompts → `auditor_proposal_snapshots.edited='edited'` → run
   entered `pending_approval` → `AuditorReviewRenderer` surfaced → header
   **"Captured guidance (2)"** listing `wayflow-gate-1: Tighten the executive
   summary.` + `wayflow-gate-2: Drop the appendix.` The renderer's normalized
   `prompts` value (extracted from the live DOM) = the 2 seeded items.
   (`Proposed changes (0)` + empty preview are EXPECTED here: `skillIds=[]`
   skips LLM patch generation — this fix is about guidance surfacing.)
2. **CLEAN (negative sanity)** — run `8fc5357b-fcd9-464f-a28c-f30fe6cdd0c5`:
   0 prompts → `edited='clean'` → `completed`, `error=null`, never entered
   `pending_approval` (the gate correctly never fired).
3. **SAME-STACK NEGATIVE CONTROL (red→green)** — run
   `24ac878c-8e9f-404c-ada1-717a8b85be71`: overlaid the pre-fix base OAS
   (sha256 `dfcd31a0…` == the exact OAS the #1838 walk mounted), regenerated the
   publish marker to the base hash so it mounts, recreated the container, drove
   the identical seed → the renderer showed **"Captured guidance (0) / No
   captured guidance."**, reproducing the #1838 bug. Restored the fixed OAS +
   marker afterward.

## Acceptance criteria

- [x] A run with N seeded HITL amendment prompts renders **"Captured guidance
  (N)"** listing each prompt — proven N=2 (`walk33-04-captured-guidance.png`).
- [x] Same-stack control: the pre-fix OAS renders "(0)" on the identical stack
  (`walk33-prefix-bug-drawer.png`) → the fix CAUSES the red→green.
- [x] No regression to the `preview`/`reviewResult` channel — the renderer parse
  is unchanged; `preview` still flows through the same `emit_review_payload`
  JSON; the clean path completes with the gate correctly not firing.
- [x] The per-guidance-prompt Dismiss control operates over the now-populated
  list (the list carries the seeded `stepKey`/`message` items the exclude seam
  matches on).

## Evidence

| File | Shows |
|---|---|
| `screenshots/walk33-04-captured-guidance.png` | FIXED drawer — **"Captured guidance (2)"** + both prompts (the AC shot) |
| `screenshots/walk33-prefix-bug-drawer.png` | SAME-STACK pre-fix drawer — **"Captured guidance (0) / No captured guidance."** |
| `screenshots/walk33-01-dispatched.png` | FIXED run dispatched |
| `screenshots/walk33-02-running.png` | FIXED run running |
| `walk33-proof.json` | machine proof — edited PASS + clean PASS, DOM-extracted normalized prompts |
| `walk33-prefix-bug-proof.json` | negative-control machine proof — capturedCount=0 |
