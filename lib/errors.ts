export interface ErrorInfo {
  message: string;
  name?: string;
  code?: string;
  details?: string;
  hint?: string;
  statusCode?: number;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

export function getErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    const withFields = error as Error & {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      statusCode?: unknown;
    };

    return {
      message: error.message || error.name || "Unknown error",
      name: error.name,
      code: readString(withFields.code),
      details: readString(withFields.details),
      hint: readString(withFields.hint),
      statusCode: readNumber(withFields.statusCode)
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const message =
      readString(record.message) ??
      readString(record.error_description) ??
      readString(record.error) ??
      readString(record.details) ??
      "Unknown error";

    return {
      message,
      name: readString(record.name),
      code: readString(record.code),
      details: readString(record.details),
      hint: readString(record.hint),
      statusCode: readNumber(record.statusCode) ?? readNumber(record.status)
    };
  }

  return { message: String(error) };
}

export function formatErrorMessage(error: unknown) {
  const info = getErrorInfo(error);
  const segments = [info.message];

  if (info.code) {
    segments.push(`code=${info.code}`);
  }

  if (info.details) {
    segments.push(`details=${info.details}`);
  }

  if (info.hint) {
    segments.push(`hint=${info.hint}`);
  }

  return segments.join(" | ");
}
