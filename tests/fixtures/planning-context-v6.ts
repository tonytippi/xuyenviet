import type { PlanningContextProposal } from "@xuyenviet/contracts";

export const planningContextVersions = {
  profileVersion: "planning-profile:v6",
  policyVersion: "planning-policy:v6",
  comparatorVersion: "planning-comparator:v6",
  valueSchemaVersions: { direction: "direction:v1", party: "party:v1", vehicle: "vehicle:v1", stay_style: "stay-style:v1", transit_style: "transit-style:v1", destination: "destination:v1", food_style: "food-style:v1", activity_style: "activity-style:v1" },
} as const;

export const clar01 = { id: "clar-01", description: "Itinerary requires direction, party, and vehicle.", proposal: { versions: planningContextVersions, scopes: [{ id: "journey", kind: "journey", parentId: null, overlapWith: [] }, { id: "delivery", kind: "deliverable", parentId: "journey", overlapWith: [] }], deliverables: [{ id: "itinerary", kind: "itinerary", scopeId: "delivery" }] } satisfies PlanningContextProposal } as const;
export const clar07 = { id: "clar-07", description: "Input ordering does not change graph identity.", proposal: { ...clar01.proposal, scopes: [...clar01.proposal.scopes].reverse(), deliverables: [...clar01.proposal.deliverables].reverse() } satisfies PlanningContextProposal } as const;
export const clar08 = { id: "clar-08", description: "Duplicate equivalent deliverables coalesce.", proposal: { ...clar01.proposal, deliverables: [{ id: "itinerary-z", kind: "itinerary", scopeId: "delivery" }, { id: "itinerary-a", kind: "itinerary", scopeId: "delivery" }] } satisfies PlanningContextProposal } as const;
export const clar13 = { id: "clar-13", description: "Cycles are rejected.", proposal: { ...clar01.proposal, scopes: [{ id: "a", kind: "journey", parentId: "b", overlapWith: [] }, { id: "b", kind: "leg", parentId: "a", overlapWith: [] }] } satisfies PlanningContextProposal } as const;
export const clar21 = { id: "clar-21", description: "Nicer destination stays remain local.", proposal: { versions: planningContextVersions, scopes: [{ id: "journey", kind: "journey", parentId: null, overlapWith: [] }, { id: "danang", kind: "destination_stay", parentId: "journey", overlapWith: [] }, { id: "transit", kind: "transit_stay", parentId: "journey", overlapWith: [] }], deliverables: [{ id: "stay", kind: "accommodation", scopeId: "danang" }] } satisfies PlanningContextProposal } as const;
export const clar22 = { id: "clar-22", description: "Incomparable overlapping values are ambiguous.", proposal: { versions: planningContextVersions, scopes: [{ id: "journey", kind: "journey", parentId: null, overlapWith: [] }, { id: "a", kind: "place", parentId: "journey", overlapWith: ["b"] }, { id: "b", kind: "group", parentId: "journey", overlapWith: ["a"] }], deliverables: [{ id: "food", kind: "food", scopeId: "a" }] } satisfies PlanningContextProposal } as const;
export const clar23 = { id: "clar-23", description: "Undeclared version pins are rejected.", proposal: { ...clar01.proposal, versions: { ...planningContextVersions, valueSchemaVersions: { ...planningContextVersions.valueSchemaVersions, unknown: "unknown:v1" } } } satisfies PlanningContextProposal } as const;

export const planningContextCanonicalCases = [clar01, clar07, clar08, clar13, clar21, clar22, clar23] as const;

export const clar02 = { id: "clar-02", description: "Vehicle and party evidence leave direction missing." } as const;
export const clar03 = { id: "clar-03", description: "Equal-scope contradictions remain ambiguous." } as const;
export const clar09 = { id: "clar-09", description: "Narrower scoped values remain local." } as const;
export const clar11 = { id: "clar-11", description: "Duplicate deliveries do not replace values." } as const;
export const clar14 = { id: "clar-14", description: "Terminal instances cannot be changed by stale work." } as const;
export const clar24 = { id: "clar-24", description: "Only ready instances can be claimed." } as const;
export const clar25 = { id: "clar-25", description: "Disjoint ready claims remain independent." } as const;
export const clar26 = { id: "clar-26", description: "Overlapping claims are rejected." } as const;
