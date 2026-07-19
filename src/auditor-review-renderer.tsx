"use client";

// ---------------------------------------------------------------------------
// AuditorReviewRenderer.
//
// HITL field renderer for @cinatra-ai/auditor-agent, binding
// `@cinatra-ai/auditor-agent:review` (kind "auditor-review"). Relocated OUT of
// the host (packages/agents/src/auditor-review-renderer.tsx) into its claiming
// extension per cinatra#1625 (epic #1620 S8 — M3) and the owner action-boundary
// ruling (2026-07-18, enabled by #1794).
//
// PER-ITEM ACCEPT (owner per-item-accept ruling, 2026-07-19). The reviewer decides
// per PROPOSED CHANGE: each proposal patch surfaced by run_skills (an
// { id, fieldPath, op, message } view of a persisted SuggestionPatch, carried on
// the snapshot's `preview.patches`) gets its own Accept / Dismiss control, keyed
// by the SAME stable id /api/auditor/apply replay-validates. Captured guidance
// prompts keep a Dismiss control that feeds the post-resume exclude seam.
//
// PURE snapshot -> onChange. Unlike the host-side original, this renderer makes
// NO authenticated host calls: it does not fetch drawer data
// (getAuditDrawerDataAction) and it does not mutate on Dismiss
// (dismissAuditPromptsAction). The agent's OWN workflow assembles the payload
// pre-interrupt (agent_run_hitl_prompts_list + the run_skills preview output,
// wired into the gate via DataFlowEdges) and applies both channels post-resume
// (/api/auditor/apply for the accepted patches, /api/auditor/exclude for the
// dismissed guidance prompts).
//
// Field-renderer signature (public @cinatra-ai/sdk-ui contract):
//   { fieldName, value, onChange, disabled, context, schema }.
//
//   value:   { prompts: AuditPromptSnapshot[], preview: AuditSkillPreview | null }
//            preview.patches: AuditProposalPatch[]  (the per-item proposals)
//
// The snapshot is already HOST-authorized before it reaches the renderer (the
// public props contract exposes no owner identity, by design — a renderer
// cannot perform authz), so there is no ownership guard here: the ruling moved
// that gate host-side alongside the pre-interrupt payload assembly.
//
// SINGLE-STRING OUTPUT. pyagentspec 26.1.2 `InputMessageNode` yields exactly one
// string output (`_validate_outputs_have_right_format`), so the gate declares a
// single `reviewResult` output and every channel travels inside it. onChange
// therefore emits ONE key — `userResponse`, the canonical WayFlow resume-text
// channel that lands as `reviewResult` — carrying
//   JSON.stringify({ acceptedPatchIds, dismissedPatchIds, excludedPromptIds }).
// (The previous encoding emitted a second `excludedPromptIds` array channel /
// gate output; that shape is UNMOUNTABLE on the pin and is not fixable by the
// #1830 declared-inputs shim, which reconciles inputs only.)
//
// The shadcn primitives are VENDORED (own-your-code copies under
// ./components/ui) — an agent extension imports only @cinatra-ai/sdk-ui (its
// props type) as first-party code and never reaches the host `@/` alias.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";

import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";

import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";

// ---------------------------------------------------------------------------
// Snapshot value shape (assembled pre-interrupt by the workflow, not fetched here)
// ---------------------------------------------------------------------------

type AuditPromptSnapshot = {
  id: string;
  stepKey: string;
  message: string;
  capturedAt?: string;
};

// A proposal patch as surfaced to the reviewer: the stable `id` is the same one
// the persisted SuggestionPatch carries and /api/auditor/apply replay-validates.
type AuditProposalPatch = {
  id: string;
  fieldPath: string;
  op: string;
  message: string;
};

type AuditSkillPreview = {
  id?: string;
  name: string;
  description: string;
  content: string;
  basedOnSkillIds?: string[];
  patches: AuditProposalPatch[];
};

type AuditorReviewValue = {
  prompts: AuditPromptSnapshot[];
  preview: AuditSkillPreview | null;
};

function toProposalPatches(value: unknown): AuditProposalPatch[] {
  if (!Array.isArray(value)) return [];
  const out: AuditProposalPatch[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.id !== "string" || p.id.length === 0) continue;
    out.push({
      id: p.id,
      fieldPath: typeof p.fieldPath === "string" ? p.fieldPath : "",
      op: typeof p.op === "string" ? p.op : "",
      message: typeof p.message === "string" ? p.message : "",
    });
  }
  return out;
}

function toAuditorReviewValue(value: unknown): AuditorReviewValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    const prompts = Array.isArray(v.prompts)
      ? (v.prompts.filter(
          (p) => p && typeof p === "object" && typeof (p as { id?: unknown }).id === "string",
        ) as AuditPromptSnapshot[])
      : [];
    const rawPreview = v.preview;
    const preview =
      rawPreview && typeof rawPreview === "object" && !Array.isArray(rawPreview)
        ? {
            id:
              typeof (rawPreview as { id?: unknown }).id === "string"
                ? (rawPreview as { id: string }).id
                : undefined,
            name:
              typeof (rawPreview as { name?: unknown }).name === "string"
                ? (rawPreview as { name: string }).name
                : "",
            description:
              typeof (rawPreview as { description?: unknown }).description === "string"
                ? (rawPreview as { description: string }).description
                : "",
            content:
              typeof (rawPreview as { content?: unknown }).content === "string"
                ? (rawPreview as { content: string }).content
                : "",
            basedOnSkillIds: Array.isArray((rawPreview as { basedOnSkillIds?: unknown }).basedOnSkillIds)
              ? ((rawPreview as { basedOnSkillIds: unknown[] }).basedOnSkillIds.filter(
                  (s) => typeof s === "string",
                ) as string[])
              : undefined,
            patches: toProposalPatches((rawPreview as { patches?: unknown }).patches),
          }
        : null;
    return { prompts, preview };
  }
  return { prompts: [], preview: null };
}

// ---------------------------------------------------------------------------
// Envelope emit. ONE channel — `userResponse` — carrying the JSON-encoded
// per-item decisions; it lands as the gate's single `reviewResult` output.
// ---------------------------------------------------------------------------

type PatchDecision = "accepted" | "dismissed";

function buildUserResponse(
  patchDecisions: Record<string, PatchDecision>,
  promptDismissals: Record<string, boolean>,
): string {
  const acceptedPatchIds = Object.keys(patchDecisions).filter(
    (id) => patchDecisions[id] === "accepted",
  );
  const dismissedPatchIds = Object.keys(patchDecisions).filter(
    (id) => patchDecisions[id] === "dismissed",
  );
  const excludedPromptIds = Object.keys(promptDismissals).filter(
    (id) => promptDismissals[id],
  );
  return JSON.stringify({ acceptedPatchIds, dismissedPatchIds, excludedPromptIds });
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function AuditorReviewRenderer({
  value,
  onChange,
  disabled,
}: FieldRendererProps) {
  const snapshot = useMemo(() => toAuditorReviewValue(value), [value]);
  const { prompts, preview } = snapshot;
  const patches = preview?.patches ?? [];

  // Per-proposal decision (the per-item accept surface) and per-guidance-prompt
  // dismissal (the exclude seam). The single resume envelope is recomputed from
  // both maps on every click.
  const [patchDecisions, setPatchDecisions] = useState<Record<string, PatchDecision>>({});
  const [promptDismissals, setPromptDismissals] = useState<Record<string, boolean>>({});

  // Stable onChange ref (mirrors the field-renderer convention).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Mount-time default emit: an empty envelope so the buffered resume value is
  // always valid JSON even if the operator clicks Continue before touching a
  // row. Per-item clicks overwrite it via `emit` below.
  useEffect(() => {
    try {
      onChangeRef.current({ userResponse: buildUserResponse({}, {}) });
    } catch {
      // Gate may already be resolved (double-mount race); swallow.
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit(
    nextPatches: Record<string, PatchDecision>,
    nextPrompts: Record<string, boolean>,
  ) {
    try {
      onChangeRef.current({ userResponse: buildUserResponse(nextPatches, nextPrompts) });
    } catch {
      // Gate already resolved; ignore.
    }
  }

  function decidePatch(patchId: string, decision: PatchDecision) {
    setPatchDecisions((prev) => {
      const next = { ...prev, [patchId]: decision };
      emit(next, promptDismissals);
      return next;
    });
  }

  function togglePromptExclusion(promptId: string) {
    setPromptDismissals((prev) => {
      const next = { ...prev, [promptId]: !prev[promptId] };
      emit(patchDecisions, next);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 text-sm text-card-foreground ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">Review proposed changes</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Accept or dismiss each proposed change individually. Only accepted
        proposals are applied. You can also dismiss captured guidance so it is
        not saved for future runs.
      </p>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Proposed changes ({patches.length})
        </h4>
        {patches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No proposed changes.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {patches.map((patch) => {
              const decision = patchDecisions[patch.id];
              return (
                <div
                  key={patch.id}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium text-muted-foreground">
                      {patch.op} {patch.fieldPath}
                    </span>
                    {decision !== undefined && (
                      <span className="text-xs font-medium text-muted-foreground">
                        {decision === "accepted" ? "Accepted" : "Dismissed"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm break-words whitespace-pre-wrap text-foreground">
                    {patch.message}
                  </p>
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled === true}
                      aria-pressed={decision === "dismissed"}
                      onClick={() => decidePatch(patch.id, "dismissed")}
                    >
                      Dismiss
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={disabled === true}
                      aria-pressed={decision === "accepted"}
                      onClick={() => decidePatch(patch.id, "accepted")}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Captured guidance ({prompts.length})
        </h4>
        {prompts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No captured guidance.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {prompts.map((p) => {
              const excluded = promptDismissals[p.id] === true;
              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {p.stepKey}
                    </span>
                    {excluded && (
                      <span className="text-xs font-medium text-muted-foreground">
                        Dismissed
                      </span>
                    )}
                  </div>
                  <p className="text-sm break-words whitespace-pre-wrap text-foreground">
                    {p.message}
                  </p>
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled === true}
                      aria-pressed={excluded}
                      onClick={() => togglePromptExclusion(p.id)}
                    >
                      {excluded ? "Keep" : "Dismiss"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Personal skill preview
        </h4>
        {preview ? (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium text-foreground">{preview.name}</div>
            <p className="text-xs text-muted-foreground">{preview.description}</p>
            <pre className="max-h-[40vh] overflow-y-auto rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap text-foreground">
              {preview.content}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No preview generated.</p>
        )}
      </div>
    </div>
  );
}

export default AuditorReviewRenderer;
