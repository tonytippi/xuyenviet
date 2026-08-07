import type { AdminYoutubeDiscoveryQuery, AdminYoutubeDiscoveryQueryList, RequestPrincipal } from "@xuyenviet/contracts";

export type AdminYoutubeDiscoveryPort = {
  list(): Promise<AdminYoutubeDiscoveryQueryList>;
  create(principal: RequestPrincipal, input: { queryText: string; priority: number; cadenceMinutes: number }): Promise<AdminYoutubeDiscoveryQuery>;
  edit(principal: RequestPrincipal, id: string, queryText: string): Promise<AdminYoutubeDiscoveryQuery | null>;
  reprioritize(principal: RequestPrincipal, id: string, priority: number): Promise<AdminYoutubeDiscoveryQuery | null>;
  pause(principal: RequestPrincipal, id: string): Promise<AdminYoutubeDiscoveryQuery | null>;
  resume(principal: RequestPrincipal, id: string): Promise<AdminYoutubeDiscoveryQuery | null>;
};
