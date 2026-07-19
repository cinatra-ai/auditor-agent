// @vitest-environment jsdom
/**
 * Vitest coverage for AuditorReviewRenderer (relocated into the claiming
 * extension, cinatra#1625 S8/M3; pure snapshot -> onChange per #1794).
 * Component-only assertions — binding-resolution / G2 cutover parity is proved
 * host-side. Skipped in this repo's standalone CI (first-party @cinatra-ai/*
 * optional peers); the monorepo runs it.
 *
 * Asserts:
 *   - Renders captured guidance rows + the skill preview from the snapshot
 *     value (no host fetch).
 *   - Mount emits an empty envelope on both channels.
 *   - Accept emits userResponse acceptedIds + empty excludedPromptIds.
 *   - Dismiss emits userResponse dismissedIds AND the same id in
 *     excludedPromptIds (the post-resume exclude seam).
 *   - Empty snapshot renders the no-guidance / no-preview floor.
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

function lastCall(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0] as {
    userResponse: string;
    excludedPromptIds: string[];
  };
}

describe("AuditorReviewRenderer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders captured guidance rows and the skill preview from the snapshot", () => {
    renderField();
    expect(screen.getByText(/Captured guidance \(2\)/)).toBeDefined();
    expect(screen.getByText(/Prefer an active voice\./)).toBeDefined();
    expect(screen.getByText(/Keep summaries under 3 sentences\./)).toBeDefined();
    expect(screen.getByText("HITL audit — Acme")).toBeDefined();
    expect(screen.getAllByRole("button", { name: /accept/i }).length).toBe(2);
  });

  it("emits an empty envelope on both channels at mount", () => {
    const { onChange } = renderField();
    const first = onChange.mock.calls[0][0] as { userResponse: string; excludedPromptIds: string[] };
    expect(JSON.parse(first.userResponse)).toEqual({ acceptedIds: [], dismissedIds: [] });
    expect(first.excludedPromptIds).toEqual([]);
  });

  it("Accept emits acceptedIds and leaves excludedPromptIds empty", () => {
    const { onChange } = renderField();
    fireEvent.click(screen.getAllByRole("button", { name: /accept/i })[0]);
    const payload = lastCall(onChange);
    expect(JSON.parse(payload.userResponse)).toEqual({ acceptedIds: ["p1"], dismissedIds: [] });
    expect(payload.excludedPromptIds).toEqual([]);
  });

  it("Dismiss emits dismissedIds AND the same id in excludedPromptIds (exclude seam)", () => {
    const { onChange } = renderField();
    fireEvent.click(screen.getAllByRole("button", { name: /dismiss/i })[1]);
    const payload = lastCall(onChange);
    expect(JSON.parse(payload.userResponse)).toEqual({ acceptedIds: [], dismissedIds: ["p2"] });
    expect(payload.excludedPromptIds).toEqual(["p2"]);
  });

  it("shows the empty-guidance floor when the snapshot has no prompts", () => {
    renderField({ value: { prompts: [], preview: null } });
    expect(screen.getByText(/No captured guidance\./)).toBeDefined();
    expect(screen.getByText(/No preview generated\./)).toBeDefined();
  });
});
