export function normalizeAdminReturnTo(value: string | null | undefined, fallback = "/admin") {
  const trimmed = value?.trim();

  if (!trimmed) {
    return fallback;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(trimmed, "http://localhost");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function appendReturnTo(path: string, returnTo: string | null | undefined) {
  const safeReturnTo = normalizeAdminReturnTo(returnTo, "");

  if (!safeReturnTo) {
    return path;
  }

  const url = new URL(path, "http://localhost");
  url.searchParams.set("returnTo", safeReturnTo);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildPathWithSearch(pathname: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    search.set(key, value);
  }

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function getAdminBackLabel(path: string) {
  if (path.startsWith("/admin/registrations")) {
    return "Back to registrations";
  }

  if (path.startsWith("/admin/events")) {
    return "Back to events";
  }

  if (path.startsWith("/check-in/")) {
    return "Back to check-in";
  }

  return "Back to admin";
}
