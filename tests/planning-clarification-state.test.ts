import { describe, expect, test } from "vitest";
import { createHash } from "node:crypto";

import { evaluateEffectivePlanningValue, evaluatePlanningCompleteness, planningContextCatalog, resolvePlanningContext } from "@xuyenviet/database";
import { reduceClarificationValues, validateClarificationEvidence } from "@xuyenviet/database";
import { clar01, clar21, clar22 } from "./fixtures/planning-context-v6";

describe("planning clarification reducer", () => {
  test("CLAR-02 preserves UTF-16-backed party and vehicle values without inventing direction", () => {
    const content = "Hai vợ chồng, đi ô tô";
    const party = "Hai vợ chồng";
    const vehicle = "ô tô";
    expect(validateClarificationEvidence(content, { key: "party", value: party, scopeId: "journey", schemaVersion: "party:v1", precedence: "nearest_ancestor", startOffset: 0, endOffset: party.length, digest: digest(party) })).toBe(true);
    expect(validateClarificationEvidence(content, { key: "vehicle", value: vehicle, scopeId: "journey", schemaVersion: "vehicle:v1", precedence: "nearest_ancestor", startOffset: content.indexOf(vehicle), endOffset: content.indexOf(vehicle) + vehicle.length, digest: digest(vehicle) })).toBe(true);
    const context = resolvePlanningContext(clar01.proposal)!;
    const values = reduceClarificationValues(context, [], [
      { key: "party", value: party, scopeId: "journey", schemaVersion: "party:v1", precedence: "nearest_ancestor" },
      { key: "vehicle", value: "car", scopeId: "journey", schemaVersion: "vehicle:v1", precedence: "nearest_ancestor" },
    ]);
    expect(values.map((value) => value.key).sort()).toEqual(["party", "vehicle"]);
    expect(values.some((value) => value.key === "direction")).toBe(false);
  });

  test("rejects invalid evidence spans and digests", () => {
    const content = "🚗 đi ô tô";
    const startOffset = content.indexOf("ô tô");
    expect(validateClarificationEvidence(content, { key: "vehicle", value: "ô tô", scopeId: "journey", schemaVersion: "vehicle:v1", precedence: "nearest_ancestor", startOffset, endOffset: startOffset + "ô tô".length, digest: digest("ô tô") })).toBe(true);
    expect(validateClarificationEvidence(content, { key: "vehicle", value: "ô tô", scopeId: "journey", schemaVersion: "vehicle:v1", precedence: "nearest_ancestor", startOffset: 4, endOffset: 8, digest: digest("ô tô") })).toBe(false);
    expect(validateClarificationEvidence(content, { key: "vehicle", value: "ô tô", scopeId: "journey", schemaVersion: "vehicle:v1", precedence: "nearest_ancestor", startOffset: 5, endOffset: 9, digest: "0".repeat(64) })).toBe(false);
  });

  test("CLAR-03 retains equal-scope contradictory candidates as ambiguous", () => {
    const context = resolvePlanningContext(clar01.proposal)!;
    const profile = context.deliverables[0]!.profile;
    const catalog = planningContextCatalog.profiles[profile.kind];
    const state = evaluateEffectivePlanningValue(catalog, "direction", context.scopes, "delivery", [
      { key: "direction", value: "Hà Nội đến Đà Nẵng", scopeId: "journey", schemaVersion: "direction:v1", precedence: "nearest_ancestor" },
      { key: "direction", value: "Đà Nẵng đến Hà Nội", scopeId: "journey", schemaVersion: "direction:v1", precedence: "nearest_ancestor" },
    ]);
    expect(state.status).toBe("ambiguous");
  });

  test("CLAR-09 keeps a narrower destination-stay override local", () => {
    const context = resolvePlanningContext(clar21.proposal)!;
    const profile = planningContextCatalog.profiles.accommodation;
    const values = [
      { key: "party", value: "Hai người", scopeId: "journey", schemaVersion: "party:v1", precedence: "nearest_ancestor" as const },
      { key: "destination", value: "Đà Nẵng", scopeId: "journey", schemaVersion: "destination:v1", precedence: "nearest_ancestor" as const },
      { key: "stay_style", value: "khách sạn đẹp", scopeId: "danang", schemaVersion: "stay-style:v1", precedence: "explicit_compatible" as const },
    ];
    expect(evaluateEffectivePlanningValue(profile, "stay_style", context.scopes, "danang", values)).toMatchObject({ status: "resolved", value: { value: "khách sạn đẹp" } });
    expect(evaluateEffectivePlanningValue(profile, "stay_style", context.scopes, "transit", values)).toEqual({ status: "missing" });
  });

  test("CLAR-11 rejects invalid keys, scopes, schemas, and preserves valid omissions", () => {
    const context = resolvePlanningContext(clar01.proposal)!;
    const preserved = reduceClarificationValues(context, [{ key: "party", value: "Hai người", scopeId: "journey", schemaVersion: "party:v1", precedence: "nearest_ancestor" }], [
      { key: "unknown", value: "x", scopeId: "journey", schemaVersion: "unknown:v1", precedence: "nearest_ancestor" },
      { key: "vehicle", value: "car", scopeId: "missing", schemaVersion: "vehicle:v1", precedence: "nearest_ancestor" },
      { key: "vehicle", value: "car", scopeId: "journey", schemaVersion: "wrong:v1", precedence: "nearest_ancestor" },
    ]);
    expect(preserved).toEqual([{ key: "party", value: "Hai người", scopeId: "journey", schemaVersion: "party:v1", precedence: "nearest_ancestor" }]);
  });

  test("CLAR-14 leaves required direction missing until an exact typed value is present", () => {
    const context = resolvePlanningContext(clar01.proposal)!;
    const profile = planningContextCatalog.profiles.itinerary;
    const completeness = evaluatePlanningCompleteness(profile, context.scopes, "delivery", [
      { key: "party", value: "Hai người", scopeId: "journey", schemaVersion: "party:v1", precedence: "nearest_ancestor" },
      { key: "vehicle", value: "car", scopeId: "journey", schemaVersion: "vehicle:v1", precedence: "nearest_ancestor" },
    ]);
    expect(completeness).toMatchObject({ ready: false, missing: ["direction"] });
  });
});

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
