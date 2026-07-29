export class ServerEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerEnvError";
  }
}

export function getRequiredServerEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new ServerEnvError(`${name} is required for server operations.`);
  return value;
}
