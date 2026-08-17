import type { CanonicalRoutePathReference, RouteResolution } from "@xuyenviet/contracts";

type CanonicalRoutePath = { id: string; origin: string; destination: string };
type RouteCoverage = { origin: string; destination: string; kind: "complete" | "partial" | "ambiguous"; pathIds: string[] };

const canonicalRoutePaths = [
  { id: "hanoi-da-nang-national-1a", origin: "Hà Nội", destination: "Đà Nẵng" },
  { id: "hanoi-da-nang-ho-chi-minh-road", origin: "Hà Nội", destination: "Đà Nẵng" },
  { id: "da-nang-quy-nhon-coastal", origin: "Đà Nẵng", destination: "Quy Nhơn" },
  { id: "hanoi-ha-long-expressway", origin: "Hà Nội", destination: "Hạ Long" },
  { id: "hanoi-ha-long-national-18", origin: "Hà Nội", destination: "Hạ Long" },
] as const satisfies readonly CanonicalRoutePath[];

const routeCoverage = [
  { origin: "Hà Nội", destination: "Đà Nẵng", kind: "complete", pathIds: ["hanoi-da-nang-national-1a", "hanoi-da-nang-ho-chi-minh-road"] },
  { origin: "Đà Nẵng", destination: "Quy Nhơn", kind: "partial", pathIds: ["da-nang-quy-nhon-coastal"] },
  { origin: "Hà Nội", destination: "Hạ Long", kind: "ambiguous", pathIds: ["hanoi-ha-long-expressway", "hanoi-ha-long-national-18"] },
] as const satisfies readonly RouteCoverage[];

const pathById = new Map<string, CanonicalRoutePath>(canonicalRoutePaths.map((path) => [path.id, path]));
const coverageByEndpoints = new Map(routeCoverage.map((coverage) => [endpointKey(coverage.origin, coverage.destination), coverage]));

validateRouteManifest();

export function isCanonicalRoutePathId(value: string): value is CanonicalRoutePathReference {
  return pathById.has(value);
}

export function resolveRouteApplicability(input: { canonicalRoutePathId: string | null; originLabel: string | null; destinationLabel: string | null }): RouteResolution {
  if (input.canonicalRoutePathId) return pathById.has(input.canonicalRoutePathId) ? { kind: "selected", pathId: input.canonicalRoutePathId } : { kind: "stale", pathId: input.canonicalRoutePathId };
  if (!input.originLabel || !input.destinationLabel) return { kind: "unsupported" };
  const coverage = coverageByEndpoints.get(endpointKey(input.originLabel, input.destinationLabel));
  return coverage ? { kind: coverage.kind, pathIds: [...coverage.pathIds] } : { kind: "unsupported" };
}

function validateRouteManifest() {
  if (pathById.size !== canonicalRoutePaths.length) throw new Error("Canonical route manifest contains duplicate path IDs.");
  for (const coverage of routeCoverage) {
    if (!coverage.origin.trim() || !coverage.destination.trim() || new Set(coverage.pathIds).size !== coverage.pathIds.length || coverage.pathIds.some((id) => {
      const path = pathById.get(id);
      return !path || endpointKey(path.origin, path.destination) !== endpointKey(coverage.origin, coverage.destination);
    })) throw new Error("Canonical route manifest contains invalid coverage.");
  }
  if (coverageByEndpoints.size !== routeCoverage.length) throw new Error("Canonical route manifest contains duplicate endpoint coverage.");
}

function endpointKey(origin: string, destination: string) {
  return `${normalizeEndpoint(origin)}\u0000${normalizeEndpoint(destination)}`;
}

function normalizeEndpoint(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi-VN").replace(/\s+/g, " ").trim();
}
