export type DatabaseHealthErrorCode =
  | "connection_unavailable"
  | "database_timeout"
  | "schema_missing"
  | "database_error";

function prismaErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : undefined;
}

export function classifyDatabaseHealthError(error: unknown): DatabaseHealthErrorCode {
  switch (prismaErrorCode(error)) {
    case "P1001":
    case "P1011":
    case "P1017":
      return "connection_unavailable";
    case "P2024":
      return "database_timeout";
    case "P2021":
      return "schema_missing";
    default:
      return "database_error";
  }
}
