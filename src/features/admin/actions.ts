"use server";

import { runAuditedAdminMutation } from "@/server/mutations";

export async function validateAdminActionAccess() {
  await runAuditedAdminMutation({
    audit: {
      operation: "access_check",
      targetType: "admin_action",
      targetId: "validate-admin-action-access",
      afterSummary: "Admin/operator action access validated from the admin shell.",
    },
    action: async () => undefined,
  });
}
