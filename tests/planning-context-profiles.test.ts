import { describe, expect, test } from "vitest";

import { parsePlanningContextProposal } from "@xuyenviet/contracts";
import { canonicalPlanningGraphDigest, comparePlanningScopes, evaluateEffectivePlanningValue, evaluatePlanningCompleteness, planningContextCatalog, resolvePlanningContext, validatePlanningScopeGraph, validatePlanningValues } from "@xuyenviet/database";
import { clar01, clar07, clar08, clar13, clar21, clar22, clar23, planningContextVersions } from "./fixtures/planning-context-v6";

describe("planning context profiles", () => {
  test("keeps all catalog semantic objects deeply immutable and profiles distinct", () => {
    expect(Object.isFrozen(planningContextCatalog)).toBe(true);
    expect(Object.isFrozen(planningContextCatalog.profiles.accommodation.fields)).toBe(true);
    expect(Object.isFrozen(planningContextCatalog.profiles.accommodation.fields[0])).toBe(true);
    expect(Object.isFrozen(planningContextCatalog.profiles.accommodation.fields[0]!.scopes)).toBe(true);
    expect(planningContextCatalog.profiles.itinerary.fields.map((field) => field.key)).not.toEqual(planningContextCatalog.profiles.accommodation.fields.map((field) => field.key));
  });

  test("parses only closed browser-safe proposals and pins every catalog version", () => {
    expect(parsePlanningContextProposal(clar01.proposal)).toEqual(clar01.proposal);
    expect(parsePlanningContextProposal({ ...clar01.proposal, confidence: 1 })).toBeNull();
    expect(resolvePlanningContext({ ...clar01.proposal, versions: { ...planningContextVersions, policyVersion: "planning-policy:v7" } })).toBeNull();
  });

  test("canonical identity ignores delivery IDs/order but includes every version pin", () => {
    const equivalent = { ...clar08.proposal, deliverables: [...clar08.proposal.deliverables].reverse() };
    const first = resolvePlanningContext(clar08.proposal)!;
    expect(first.deliverables).toHaveLength(1);
    expect(first.graphDigest).toBe(resolvePlanningContext(equivalent)?.graphDigest);
    expect(first.graphDigest).not.toBe(canonicalPlanningGraphDigest(clar08.proposal.scopes, clar08.proposal.deliverables, { ...planningContextVersions, comparatorVersion: "planning-comparator:v7" }));
    expect(resolvePlanningContext(clar07.proposal)?.graphDigest).toBe(first.graphDigest);
  });

  test("rejects every graph and deliverable policy boundary", () => {
    expect(resolvePlanningContext(clar13.proposal)).toBeNull();
    expect(resolvePlanningContext(clar23.proposal)).toBeNull();
    expect(validatePlanningScopeGraph([{ id: "orphan", kind: "leg", parentId: "missing", overlapWith: [] }])).toBeNull();
    expect(validatePlanningScopeGraph([{ id: "bad", kind: "invalid" as never, parentId: null, overlapWith: [] }])).toBeNull();
    expect(validatePlanningScopeGraph([{ id: "self", kind: "journey", parentId: null, overlapWith: ["self"] }])).toBeNull();
    expect(validatePlanningScopeGraph(Array.from({ length: 101 }, (_, index) => ({ id: `n${index}`, kind: "journey" as const, parentId: null, overlapWith: [] })))).toBeNull();
    expect(validatePlanningScopeGraph([{ id: "root", kind: "journey", parentId: null, overlapWith: [] }, ...Array.from({ length: 13 }, (_, index) => ({ id: `n${index}`, kind: "leg" as const, parentId: index === 0 ? "root" : `n${index - 1}`, overlapWith: [] }))])).toBeNull();
    expect(resolvePlanningContext({ ...clar01.proposal, deliverables: Array.from({ length: 41 }, (_, index) => ({ id: `d${index}`, kind: "itinerary" as const, scopeId: "delivery" })) })).toBeNull();
    expect(resolvePlanningContext({ ...clar01.proposal, deliverables: [] })).toBeNull();
  });

  test("validates declared, scoped, schema-pinned values before they affect readiness", () => {
    const graph = resolvePlanningContext(clar01.proposal)!.scopes;
    const profile = planningContextCatalog.profiles.itinerary;
    const valid = validatePlanningValues(profile, graph, [
      { key: "direction", value: "Hà Nội đến Đà Nẵng", scopeId: "journey", schemaVersion: "direction:v1", precedence: "nearest_ancestor" },
      { key: "party", value: "2 người lớn", scopeId: "journey", schemaVersion: "party:v1", precedence: "nearest_ancestor" },
      { key: "vehicle", value: "car", scopeId: "journey", schemaVersion: "vehicle:v1", precedence: "nearest_ancestor" },
      { key: "unknown", value: "ignored", scopeId: "journey", schemaVersion: "unknown:v1", precedence: "nearest_ancestor" },
      { key: "vehicle", value: "boat", scopeId: "journey", schemaVersion: "vehicle:v1", precedence: "nearest_ancestor" },
      { key: "direction", value: "wrong", scopeId: "delivery", schemaVersion: "direction:v1", precedence: "nearest_ancestor" },
    ]);
    expect(valid).toHaveLength(3);
    expect(evaluatePlanningCompleteness(profile, graph, "delivery", valid)).toEqual({ ready: true, missing: [], assumed: [] });
  });

  test("inherits compatible journey values and evaluates scoped accommodation fields", () => {
    const graph = resolvePlanningContext(clar21.proposal)!.scopes;
    const profile = planningContextCatalog.profiles.accommodation;
    const values = validatePlanningValues(profile, graph, [
      { key: "party", value: "gia đình", scopeId: "journey", schemaVersion: "party:v1", precedence: "nearest_ancestor" },
      { key: "destination", value: "Đà Nẵng", scopeId: "journey", schemaVersion: "destination:v1", precedence: "nearest_ancestor" },
      { key: "stay_style", value: "nicer", scopeId: "danang", schemaVersion: "stay-style:v1", precedence: "explicit_compatible" },
    ]);
    expect(evaluatePlanningCompleteness(profile, graph, "danang", values)).toEqual({ ready: true, missing: [], assumed: [] });
    expect(evaluatePlanningCompleteness(profile, graph, "transit", values)).toEqual({ ready: true, missing: [], assumed: ["transit_style"] });
    expect(evaluateEffectivePlanningValue(profile, "stay_style", graph, "danang", values)).toMatchObject({ status: "resolved", value: { value: "nicer" } });
    expect(evaluateEffectivePlanningValue(profile, "stay_style", graph, "danang", [{ key: "stay_style", value: "wrong", scopeId: "danang", schemaVersion: "stay-style:v9", precedence: "explicit_compatible" }])).toEqual({ status: "missing" });
  });

  test("bounds values and hardens direct comparator calls", () => {
    const graph = resolvePlanningContext(clar01.proposal)!.scopes;
    const values = Array.from({ length: 11 }, () => ({ key: "direction", value: "Hà Nội", scopeId: "journey", schemaVersion: "direction:v1", precedence: "nearest_ancestor" as const }));
    expect(validatePlanningValues(planningContextCatalog.profiles.itinerary, graph, values)).toHaveLength(10);
    expect(validatePlanningValues(planningContextCatalog.profiles.itinerary, graph, [{ ...values[0]!, value: "x".repeat(2_001) }])).toEqual([]);
    expect(comparePlanningScopes(clar13.proposal.scopes, "a", "b")).toBeNull();
    expect(comparePlanningScopes(clar22.proposal.scopes, "a", "b")).toBe("overlap");
    expect(evaluateEffectivePlanningValue(planningContextCatalog.profiles.food, "food_style", clar22.proposal.scopes, "a", [{ key: "food_style", value: "x", scopeId: "b", schemaVersion: "food-style:v1", precedence: "explicit_compatible" }])).toEqual({ status: "missing" });
  });
});
