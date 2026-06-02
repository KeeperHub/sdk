import { describe, it, expect } from "vitest";
import { extractTriggerInputFields } from "../src/template-refs.js";
import type { WorkflowNode } from "../src/types.js";

const TRIGGER_ID = "trigger_123";

function node(id: string, config: Record<string, unknown>): WorkflowNode {
  return {
    id,
    type: id === TRIGGER_ID ? "trigger" : "action",
    data: { config },
  };
}

describe("extractTriggerInputFields", () => {
  it("returns empty for no nodes", () => {
    expect(extractTriggerInputFields([], TRIGGER_ID)).toEqual([]);
  });

  it("extracts an explicit reference using the real trigger id", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node("a1", { address: `{{@${TRIGGER_ID}.address}}` }),
        ],
        TRIGGER_ID
      )
    ).toEqual(["address"]);
  });

  it("recognizes the {{@trigger.X}} UI alias", () => {
    expect(
      extractTriggerInputFields(
        [node(TRIGGER_ID, {}), node("a1", { address: "{{@trigger.address}}" })],
        TRIGGER_ID
      )
    ).toEqual(["address"]);
  });

  it("uses the top-level field of a nested path", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node("a1", { address: "{{@trigger.address.line1}}" }),
        ],
        TRIGGER_ID
      )
    ).toEqual(["address"]);
  });

  it("dedupes and sorts multiple distinct fields", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node("a1", {
            recipient: "{{@trigger.recipient}}",
            amount: "{{@trigger.amount}}",
          }),
          node("a2", { recipient: "{{@trigger.recipient}}" }),
          node("a3", { token: "{{@trigger.token}}" }),
        ],
        TRIGGER_ID
      )
    ).toEqual(["amount", "recipient", "token"]);
  });

  it("ignores refs to non-trigger nodes", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node("a1", {
            x: "{{@a2.something}}",
            y: "{{@trigger.fromTrigger}}",
          }),
          node("a2", {}),
        ],
        TRIGGER_ID
      )
    ).toEqual(["fromTrigger"]);
  });

  it("walks deeply nested objects and arrays in config", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node("a1", {
            outer: { inner: { addr: "{{@trigger.address}}" } },
            list: ["{{@trigger.amount}}"],
          }),
        ],
        TRIGGER_ID
      )
    ).toEqual(["address", "amount"]);
  });

  it("skips the trigger node's own config", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, { sneaky: "{{@trigger.shouldNotAppear}}" }),
          node("a1", { real: "{{@trigger.actual}}" }),
        ],
        TRIGGER_ID
      )
    ).toEqual(["actual"]);
  });

  it("tolerates whitespace around the template body", () => {
    expect(
      extractTriggerInputFields(
        [node(TRIGGER_ID, {}), node("a1", { x: "{{ @trigger.address }}" })],
        TRIGGER_ID
      )
    ).toEqual(["address"]);
  });

  it("recognizes the labeled form {{@<id>:Label.field}}", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node("a1", { x: `{{@${TRIGGER_ID}:Manual.address}}` }),
        ],
        TRIGGER_ID
      )
    ).toEqual(["address"]);
  });

  it("ignores templates missing the @ ({{trigger.x}})", () => {
    expect(
      extractTriggerInputFields(
        [node(TRIGGER_ID, {}), node("a1", { x: "{{trigger.address}}" })],
        TRIGGER_ID
      )
    ).toEqual([]);
  });

  it("ignores templates missing the .field ({{@trigger}})", () => {
    expect(
      extractTriggerInputFields(
        [node(TRIGGER_ID, {}), node("a1", { x: "{{@trigger}}" })],
        TRIGGER_ID
      )
    ).toEqual([]);
  });

  it("ignores empty braces {{}}", () => {
    expect(
      extractTriggerInputFields(
        [node(TRIGGER_ID, {}), node("a1", { x: "{{}}" })],
        TRIGGER_ID
      )
    ).toEqual([]);
  });

  it("extracts only the valid ref from mixed valid + garbage", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node("a1", {
            x: "before {{garbage}} {{@trigger.address}} after {{not.a.ref}}",
          }),
        ],
        TRIGGER_ID
      )
    ).toEqual(["address"]);
  });

  it("does not crash on non-string config values", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node("a1", {
            n: 42,
            b: true,
            nul: null,
            addr: "{{@trigger.address}}",
          }),
        ],
        TRIGGER_ID
      )
    ).toEqual(["address"]);
  });

  it("yields no refs for empty string values", () => {
    expect(
      extractTriggerInputFields(
        [node(TRIGGER_ID, {}), node("a1", { x: "" })],
        TRIGGER_ID
      )
    ).toEqual([]);
  });

  it("walks deeply nested config (10 levels) without bailing", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node(
            "a1",
            Array.from({ length: 10 }).reduce<Record<string, unknown>>(
              (acc) => ({ wrap: acc }),
              { addr: "{{@trigger.deep}}" }
            )
          ),
        ],
        TRIGGER_ID
      )
    ).toEqual(["deep"]);
  });

  it("extracts multiple refs in a single string", () => {
    expect(
      extractTriggerInputFields(
        [
          node(TRIGGER_ID, {}),
          node("a1", { x: "from {{@trigger.from}} to {{@trigger.to}}" }),
        ],
        TRIGGER_ID
      )
    ).toEqual(["from", "to"]);
  });
});
