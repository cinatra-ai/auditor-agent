/**
 * OAS wiring contract for the auditor review payload (cinatra-ai/auditor-agent#33).
 *
 * Regression guard for the fix that makes the review gate render its captured
 * guidance + preview. An InputMessageNode gate interrupt cannot carry its
 * DataFlowEdge-delivered inputs across the WayFlow -> host A2A boundary on the
 * pinned runtime (pyagentspec/wayflowcore 26.1.2): UserMessageRequestStatus
 * carries only the node's rendered message, and the host `__cinatra_endnode_outputs__`
 * DataPart surfaces resolved values ONLY at FinishedStatus, never at input-required.
 * The prior graph wired prep_list.prompts and run_skills.preview straight into the
 * gate's declared inputs, so neither ever reached the renderer ("Captured guidance (0)").
 *
 * The fix mirrors the proven context-selection-agent `emit_context_payload`
 * pattern: a dedicated OutputMessageNode assembles { prompts, preview } into a
 * single plain-JSON agent message via `| tojson`, which becomes the last agent
 * message the host reads at interrupt (execution.ts handleWayflowTaskState ->
 * spreadFromOutput spreads it into the renderer value). The gate declares NO
 * inputs (also keeping the #1830 loader shim from rewriting it).
 *
 * These assertions pin that wiring so a future edit cannot silently reintroduce
 * the drop by re-declaring gate inputs or re-pointing the DFEs at the gate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Ref = { $component_ref: string };
type ControlEdge = { name?: string; from_node: Ref; to_node: Ref; from_branch?: string };
type DataEdge = {
  name?: string;
  source_node: Ref;
  source_output: string;
  destination_node: Ref;
  destination_input: string;
};
type Oas = {
  nodes: Ref[];
  control_flow_connections: ControlEdge[];
  data_flow_connections: DataEdge[];
  $referenced_components: Record<string, Record<string, unknown>>;
};

const oas = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../cinatra/oas.json", import.meta.url)), "utf8"),
) as Oas;

const refs = oas.$referenced_components;
const control = oas.control_flow_connections;
const data = oas.data_flow_connections;

describe("auditor OAS review-payload wiring (#33)", () => {
  it("declares the emit_review_payload OutputMessageNode with prompts + preview inputs", () => {
    const emit = refs.emit_review_payload;
    expect(emit).toBeDefined();
    expect(emit.component_type).toBe("OutputMessageNode");
    const inputTitles = (emit.inputs as Array<{ title?: string }>).map((i) => i.title).sort();
    expect(inputTitles).toEqual(["preview", "prompts"]);
  });

  it("renders the payload as a single plain-JSON object via the tojson filter", () => {
    const emit = refs.emit_review_payload;
    const message = emit.message as string;
    // The pyagentspec input-hint comment carries the bare placeholders so the
    // runtime infers the inputs; it renders to the empty string.
    expect(message).toContain("{# pyagentspec-input-hint");
    expect(message).toContain("{{ prompts }}");
    expect(message).toContain("{{ preview }}");
    // The emitted value is a plain JSON object keyed by prompts + preview, each
    // serialized with | tojson so spreadFromOutput can JSON.parse it.
    expect(message).toContain('"prompts":{{ prompts | tojson }}');
    expect(message).toContain('"preview":{{ preview | tojson }}');
    // Everything after the Jinja comment must be a single {...} object.
    const rendered = message.replace(/\{#[\s\S]*?#\}/, "").trim();
    expect(rendered.startsWith("{")).toBe(true);
    expect(rendered.endsWith("}")).toBe(true);
  });

  it("wires prep_list.prompts and run_skills.preview into the emit node (NOT the gate)", () => {
    const promptsEdge = data.find(
      (e) => e.source_node.$component_ref === "prep_list" && e.source_output === "prompts",
    );
    expect(promptsEdge?.destination_node.$component_ref).toBe("emit_review_payload");
    expect(promptsEdge?.destination_input).toBe("prompts");

    const previewEdge = data.find(
      (e) => e.source_node.$component_ref === "run_skills" && e.source_output === "preview",
    );
    expect(previewEdge?.destination_node.$component_ref).toBe("emit_review_payload");
    expect(previewEdge?.destination_input).toBe("preview");
  });

  it("routes control flow prep_list -> emit_review_payload -> review_gate", () => {
    const hasEdge = (from: string, to: string) =>
      control.some((e) => e.from_node.$component_ref === from && e.to_node.$component_ref === to);
    expect(hasEdge("prep_list", "emit_review_payload")).toBe(true);
    expect(hasEdge("emit_review_payload", "review_gate")).toBe(true);
    // The old direct edge must be gone.
    expect(hasEdge("prep_list", "review_gate")).toBe(false);
  });

  it("keeps the review_gate inputless so the #1830 shim never rewrites it and no DFE targets it", () => {
    const gate = refs.review_gate;
    expect(gate.component_type).toBe("InputMessageNode");
    // No declared inputs — the regression that caused the drop.
    expect(gate.inputs === undefined || (gate.inputs as unknown[]).length === 0).toBe(true);
    // The single string output stays.
    const outputTitles = (gate.outputs as Array<{ title?: string }>).map((o) => o.title);
    expect(outputTitles).toEqual(["reviewResult"]);
    // Nothing may DataFlowEdge into the gate (its payload comes from the
    // preceding emit node's message, not a DFE).
    const intoGate = data.filter((e) => e.destination_node.$component_ref === "review_gate");
    expect(intoGate).toHaveLength(0);
  });
});
