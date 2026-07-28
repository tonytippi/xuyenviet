import postgres from "postgres";

export type ApiIdentityRecord = {
  userId: string;
  expires: Date;
  authorizationVersion: number;
};

export interface ApiIdentityRepository {
  getSession(sessionId: string): Promise<ApiIdentityRecord | null>;
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
