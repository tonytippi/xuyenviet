import { bootstrapInitialAdmin } from "../src/features/auth/role-governance";

async function main() {
  const result = await bootstrapInitialAdmin(process.env.INITIAL_ADMIN_EMAIL);
  console.log(`Initial administrator bootstrapped for user ${result.targetUserId}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
