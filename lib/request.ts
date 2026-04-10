export function getClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");

  if (!forwarded) {
    return null;
  }

  return forwarded.split(",")[0]?.trim() ?? null;
}
