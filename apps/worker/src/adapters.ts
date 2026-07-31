import { runWorkerAdapter } from "@xuyenviet/worker-domain/adapters";

runWorkerAdapter(process.argv.slice(2)).then(
  () => process.exit(0),
  (error) => {
    console.error("Worker adapter failed", error);
    process.exit(1);
  },
);
