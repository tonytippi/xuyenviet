import postgres from "postgres";

export type ApiIdentityRecord = {
  userId: string;
  expires: Date;
  authorizationVersion: number;
};

export interface ApiIdentityRepository {
  getSession(sessionId: string): Promise<ApiIdentityRecord | null>;
}

export type StoredConversationSummaryRow = { id: string; updatedAt: Date; messageContent: string | null };
export type ReleaseSchemaVersionRepository = {
  hasCompatibleSchemaVersion(version: string): Promise<boolean>;
  recordSchemaVersion(version: string): Promise<void>;
};
export interface ConversationSummaryRepository {
  listOwnedConversationSummaryRows(userId: string, limit: number): Promise<StoredConversationSummaryRow[]>;
}

export function createPostgresConversationSummaryRepository(databaseUrl: string): ConversationSummaryRepository {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async listOwnedConversationSummaryRows(userId, limit) {
      return sql<StoredConversationSummaryRow[]>`
        select selected.id, selected.updated_at as "updatedAt", preview.content as "messageContent"
        from (
          select id, updated_at
          from conversations
          where user_id = ${userId} and trip_project_id is null
          order by updated_at desc, id desc
          limit ${limit}
        ) selected
        left join lateral (
          select content
          from messages
          where conversation_id = selected.id and user_id = ${userId} and role = 'user'
          order by created_at asc, id asc
          limit 1
        ) preview on true
        order by selected.updated_at desc, selected.id desc
      `;
    },
  };
}

export function createPostgresReleaseSchemaVersionRepository(databaseUrl: string): ReleaseSchemaVersionRepository {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async hasCompatibleSchemaVersion(version) {
      const rows = await sql<{ version: string }[]>`select version from release_schema_versions order by recorded_at desc limit 1`;
      return rows[0]?.version === version;
    },
    async recordSchemaVersion(version) {
      await sql.begin(async (transaction) => {
        await transaction`select pg_advisory_xact_lock(918_040_004)`;
        await transaction`delete from release_schema_versions`;
        await transaction`insert into release_schema_versions (version) values (${version})`;
      });
    },
  };
}

export function createPostgresApiIdentityRepository(databaseUrl: string): ApiIdentityRepository {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async getSession(sessionId) {
      const rows = await sql<ApiIdentityRecord[]>`
        select sessions.user_id as "userId", sessions.expires, users.authorization_version as "authorizationVersion"
        from sessions join users on users.id = sessions.user_id
        where sessions.session_token = ${sessionId}
        limit 1
      `;
      return rows[0] ?? null;
    },
  };
}
