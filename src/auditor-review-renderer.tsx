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
// PURE snapshot -> onChange. Unlike the host-side original, this renderer makes
// NO authenticated host calls: it does not fetch drawer data
// (getAuditDrawerDataAction) and it does not mutate on Dismiss
// (dismissAuditPromptsAction). The agent's OWN workflow assembles the payload
// pre-interrupt (agent_run_hitl_prompts_list + the run_skills preview output,
// wired into the gate via DataFlowEdges) and applies exclusions post-resume
// (agent_run_hitl_prompts_exclude). The renderer only reads the authorized
// snapshot and emits a value.
//
// Field-renderer signature (public @cinatra-ai/sdk-ui contract):
//   { fieldName, value, onChange, disabled, context, schema }.
//
//   value:   { prompts: AuditPromptSnapshot[], preview: AuditSkillPreview | null }
//
// The snapshot is already HOST-authorized before it reaches the renderer (the
// public props contract exposes no owner identity, by design — a renderer
// cannot perform authz), so there is no ownership guard here: the ruling moved
// that gate host-side alongside the pre-interrupt payload assembly.
//
// onChange emits BOTH channels so the graph can consume each deterministically:
//   userResponse       — the canonical WayFlow resume-text channel
//                        (JSON { acceptedIds, dismissedIds }); apply_patches reads it.
//   excludedPromptIds  — the dismissed ids, wired into the post-resume
//                        agent_run_hitl_prompts_exclude node.
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

type AuditSkillPreview = {
  id?: string;
  name: string;
  description: string;
  content: string;
  basedOnSkillIds?: string[];
};

type AuditorReviewValue = {
  prompts: AuditPromptSnapshot[];
  preview: AuditSkillPreview | null;
};

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
          }
        : null;
    return { prompts, preview };
  }
  return { prompts: [], preview: null };
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

  // Per-prompt decision so the operator sees what they clicked; the resume
  // payload is recomputed from this map on every click.
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "dismissed">>({});

  // Stable onChange ref (mirrors the field-renderer convention).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Mount-time default emit: an empty envelope so the buffered resume value is
  // always valid JSON even if the operator clicks Continue before touching a
  // row. Per-prompt clicks overwrite it via `emit` below.
  useEffect(() => {
    try {
      onChangeRef.current({
        userResponse: JSON.stringify({ acceptedIds: [], dismissedIds: [] }),
        excludedPromptIds: [],
      });
    } catch {
      // Gate may already be resolved (double-mount race); swallow.
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit(next: Record<string, "accepted" | "dismissed">) {
    const acceptedIds = Object.keys(next).filter((id) => next[id] === "accepted");
    const dismissedIds = Object.keys(next).filter((id) => next[id] === "dismissed");
    try {
      onChangeRef.current({
        userResponse: JSON.stringify({ acceptedIds, dismissedIds }),
        excludedPromptIds: dismissedIds,
      });
    } catch {
      // Gate already resolved; ignore.
    }
  }

  function decide(promptId: string, decision: "accepted" | "dismissed") {
    setDecisions((prev) => {
      const next = { ...prev, [promptId]: decision };
      emit(next);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 text-sm text-card-foreground ring-1 ring-foreground/10">
      <div className="flex items-center gap-2">
        <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">Skill preview</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Review the captured guidance from this run and the generated personal
        skill preview. Accept to confirm, or dismiss to discard the captured
        guidance.
      </p>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Captured guidance ({prompts.length})
        </h4>
        {prompts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No captured guidance.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {prompts.map((p) => {
              const decision = decisions[p.id];
              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {p.stepKey}
                    </span>
                    {decision !== undefined && (
                      <span className="text-xs font-medium text-muted-foreground">
                        {decision === "accepted" ? "Accepted" : "Dismissed"}
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
                      aria-pressed={decision === "dismissed"}
                      onClick={() => decide(p.id, "dismissed")}
                    >
                      Dismiss
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={disabled === true}
                      aria-pressed={decision === "accepted"}
                      onClick={() => decide(p.id, "accepted")}
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
