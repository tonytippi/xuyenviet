import { sql } from "drizzle-orm";
import type { AdminYoutubeDiscoveryActionRequiredCursor } from "@xuyenviet/contracts";
import type { YoutubeDiscoveryMissionActionFrontierPort } from "@xuyenviet/domain";
import { getDb } from "./client";

type MissionActionFrontierDatabase = Pick<ReturnType<typeof getDb>, "execute">;
type MissionActionRow = { actionId: string; priority: number; occurredAt: string; reason: "mission_disabled" | "mission_no_enabled_query" | "mission_no_progress" };

/** Composes Knowledge mission identity with Discovery-owned query and run progress. */
export function createYoutubeDiscoveryMissionActionFrontier(db: MissionActionFrontierDatabase = getDb()): YoutubeDiscoveryMissionActionFrontierPort {
  return {
    async listMissionNeeds(policy, cursor, limit) {
      const after = missionAfter(cursor);
      const rows = await db.execute(missionItems(policy, after, limit)) as MissionActionRow[];
      const admitsCursor = !cursor || cursor.kind !== "mission_need" || cursor.urgency === 1 && Boolean((await db.execute(missionItems(policy, sql`true`, 1, cursor)) as MissionActionRow[])[0]);
      return { items: rows.map((row) => ({ ...row, occurredAt: new Date(row.occurredAt) })), admitsCursor };
    },
  };
}

function missionAfter(cursor: AdminYoutubeDiscoveryActionRequiredCursor | null) {
  if (!cursor || cursor.urgency < 1) return sql`true`;
  if (cursor.urgency > 1) return sql`false`;
  return sql`items.priority > ${cursor.priority} or (items.priority = ${cursor.priority} and (items.occurred_at > ${cursor.occurredAt} or (items.occurred_at = ${cursor.occurredAt} and ('mission_need' > ${cursor.kind} or ('mission_need' = ${cursor.kind} and items.action_id > ${cursor.actionId})))))`;
}

function missionItems(policy: Readonly<{ enabled: boolean; highPriorityMaximum: number; missionStallHours: number }>, after: ReturnType<typeof sql>, limit: number, anchor?: AdminYoutubeDiscoveryActionRequiredCursor) {
  return sql`
    with mission_identity as (
      select discovery_mission_action_id as action_id, priority, created_at
      from knowledge_recommendations
       where status = 'open' and work_type = 'missing_context' and priority <= ${policy.highPriorityMaximum} and discovery_mission_action_id is not null
    ), progress as (
      select mission.action_id, mission.priority, mission.created_at as mission_created_at,
        proposal.enabled as query_enabled, proposal.created_at as query_created_at,
        max(run.terminal_at) filter (where run.state = 'completed') as latest_success_at
      from mission_identity mission
      left join youtube_discovery_query_proposals proposal on proposal.mission_action_id = mission.action_id
      left join youtube_discovery_runs run on run.query_proposal_id = proposal.id
      group by mission.action_id, mission.priority, mission.created_at, proposal.enabled, proposal.created_at
    ), items as (
      select action_id, priority,
        to_char(date_trunc('milliseconds', coalesce(latest_success_at, query_created_at, mission_created_at)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as occurred_at,
        case when not ${policy.enabled} then 'mission_disabled'
          when query_enabled is not true then 'mission_no_enabled_query'
          else 'mission_no_progress' end as reason
      from progress
      where not ${policy.enabled}
        or query_enabled is not true
        or clock_timestamp() - coalesce(latest_success_at, query_created_at, mission_created_at) >= ${policy.missionStallHours} * interval '1 hour'
    )
    select action_id as "actionId", priority, occurred_at as "occurredAt", reason
    from items
    where ${anchor ? sql`items.action_id = ${anchor.actionId} and items.priority = ${anchor.priority} and items.occurred_at = ${anchor.occurredAt}` : after}
    order by priority asc, occurred_at asc, action_id asc
    limit ${limit}
  `;
}
