// @vitest-environment jsdom
/**
 * Vitest coverage for AuditorReviewRenderer (relocated into the claiming
 * extension, cinatra#1625 S8/M3; pure snapshot -> onChange per #1794; per-item
 * accept per the owner per-item-accept ruling of 2026-07-19).
 * Component-only assertions — binding-resolution / G2 cutover parity is proved
 * host-side. Skipped in this repo's standalone CI (first-party @cinatra-ai/*
 * optional peers); the monorepo runs it.
 *
 * Asserts:
 *   - Renders per-proposal rows + captured guidance + the skill preview from
 *     the snapshot value (no host fetch).
 *   - Mount emits a single `userResponse` channel carrying an empty envelope
 *     { acceptedPatchIds, dismissedPatchIds, excludedPromptIds }.
 *   - Accept/Dismiss on a proposal emits that patch id in
 *     acceptedPatchIds / dismissedPatchIds.
 *   - Dismissing captured guidance emits its id in excludedPromptIds (the
 *     post-resume exclude seam), independent of the patch decisions.
 *   - Only ONE onChange key is emitted (single-string output rule).
 *   - Empty snapshot renders the no-proposals / no-guidance / no-preview floor.
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import type { FieldRendererProps } from "@cinatra-ai/sdk-ui/field-renderer-props";
import { AuditorReviewRenderer } from "../auditor-review-renderer";

const MINIMAL_CONTEXT: FieldRendererProps["context"] = { connectedApps: [] };

const BASE_VALUE = {
  prompts: [
    { id: "p1", stepKey: "tone", message: "Prefer an active voice.", capturedAt: "2026-07-18T00:00:00.000Z" },
    { id: "p2", stepKey: "length", message: "Keep summaries under 3 sentences.", capturedAt: "2026-07-18T00:01:00.000Z" },
  ],
  preview: {
    id: "sk1",
    name: "HITL audit — Acme",
    description: "Captured writing guidance.",
    content: "# Guidance\n- Active voice\n- Short summaries",
    basedOnSkillIds: ["base-1"],
    patches: [
      { id: "s1", fieldPath: "/summary", op: "replace", message: "Tighten the summary to one sentence." },
      { id: "s2", fieldPath: "/tags/0", op: "add", message: "Add the 'active-voice' tag." },
    ],
  },
};

function renderField(overrides: { value?: unknown; context?: unknown } = {}) {
  const onChange = vi.fn();
  return {
    onChange,
    ...render(
      <AuditorReviewRenderer
        fieldName="review"
        schema={{ "x-renderer": "@cinatra-ai/auditor-agent:review" }}
        value={overrides.value ?? BASE_VALUE}
        onChange={onChange}
        context={(overrides.context as FieldRendererProps["context"]) ?? MINIMAL_CONTEXT}
      />,
    ),
  };
}

type Payload = { userResponse: string };

function lastCall(onChange: ReturnType<typeof vi.fn>): Payload {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0] as Payload;
}

function decode(payload: Payload) {
  return JSON.parse(payload.userResponse) as {
    acceptedPatchIds: string[];
    dismissedPatchIds: string[];
    excludedPromptIds: string[];
  };
}

describe("AuditorReviewRenderer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders proposals, captured guidance, and the skill preview from the snapshot", () => {
    renderField();
    expect(screen.getByText(/Proposed changes \(2\)/)).toBeDefined();
    expect(screen.getByText(/Tighten the summary to one sentence\./)).toBeDefined();
    expect(screen.getByText(/Add the 'active-voice' tag\./)).toBeDefined();
    expect(screen.getByText(/Captured guidance \(2\)/)).toBeDefined();
    expect(screen.getByText(/Prefer an active voice\./)).toBeDefined();
    expect(screen.getByText("HITL audit — Acme")).toBeDefined();
    // One Accept per proposal.
    expect(screen.getAllByRole("button", { name: /^accept$/i }).length).toBe(2);
  });

  it("emits a single userResponse channel with an empty envelope at mount", () => {
    const { onChange } = renderField();
    const first = onChange.mock.calls[0][0] as Payload;
    expect(Object.keys(first)).toEqual(["userResponse"]);
    expect(decode(first)).toEqual({
      acceptedPatchIds: [],
      dismissedPatchIds: [],
      excludedPromptIds: [],
    });
  });

  it("Accept on a proposal emits its patch id in acceptedPatchIds", () => {
    const { onChange } = renderField();
    fireEvent.click(screen.getAllByRole("button", { name: /^accept$/i })[0]);
    const payload = lastCall(onChange);
    expect(Object.keys(payload)).toEqual(["userResponse"]);
    expect(decode(payload)).toEqual({
      acceptedPatchIds: ["s1"],
      dismissedPatchIds: [],
      excludedPromptIds: [],
    });
  });

  it("Dismiss on a proposal emits its patch id in dismissedPatchIds", () => {
    const { onChange } = renderField();
    // The second proposal's Dismiss button (proposal-row dismiss buttons come
    // before the guidance-row ones in DOM order).
    fireEvent.click(screen.getAllByRole("button", { name: /^dismiss$/i })[1]);
    const payload = lastCall(onChange);
    expect(decode(payload)).toEqual({
      acceptedPatchIds: [],
      dismissedPatchIds: ["s2"],
      excludedPromptIds: [],
    });
  });

  it("Dismissing captured guidance emits its id in excludedPromptIds (exclude seam)", () => {
    const { onChange } = renderField();
    // Accept proposal s1 first, then dismiss guidance p2 — the two channels are
    // independent and both ride the single envelope.
    fireEvent.click(screen.getAllByRole("button", { name: /^accept$/i })[0]);
    // Guidance dismiss buttons follow the two proposal dismiss buttons.
    // DOM order: two proposal-row Dismiss buttons (s1, s2), then the guidance-row
    // Dismiss buttons (p1, p2). Index 2 is p1's Dismiss.
    const dismissButtons = screen.getAllByRole("button", { name: /^dismiss$/i });
    fireEvent.click(dismissButtons[2]);
    const payload = lastCall(onChange);
    const decoded = decode(payload);
    expect(decoded.acceptedPatchIds).toEqual(["s1"]);
    expect(decoded.dismissedPatchIds).toEqual([]);
    expect(decoded.excludedPromptIds).toEqual(["p1"]);
  });

  it("shows the empty floors when the snapshot has no proposals/guidance/preview", () => {
    renderField({ value: { prompts: [], preview: null } });
    expect(screen.getByText(/No proposed changes\./)).toBeDefined();
    expect(screen.getByText(/No captured guidance\./)).toBeDefined();
    expect(screen.getByText(/No preview generated\./)).toBeDefined();
  });
});
