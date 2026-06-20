/**
 * Name of the cookie that holds the active organization id. The org-switcher
 * (client) sets it; the tRPC context reads it. Using a cookie means both RSC
 * and client requests carry the active organization without special-casing.
 */
export const ACTIVE_ORG_COOKIE = "mw_active_org";

/** Header equivalent, honored in addition to the cookie (e.g. for API clients). */
export const ACTIVE_ORG_HEADER = "x-organization-id";

/** Extract the active organization id from a request's header or cookie. */
export function readActiveOrgId(headers: Headers): string | undefined {
  const fromHeader = headers.get(ACTIVE_ORG_HEADER);
  if (fromHeader) return fromHeader;

  const cookie = headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ACTIVE_ORG_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}
