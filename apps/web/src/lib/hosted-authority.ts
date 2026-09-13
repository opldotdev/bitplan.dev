import { isHostedId } from "./hosted-id";

const PREFIX = "bitplan:hosted-owner:";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Browser-local update capability. Never put it in a reader link or live room. */
export function hostedAuthority(
  id: string,
  storage?: Pick<Storage, "getItem">
): string | null {
  if (!isHostedId(id)) {
    return null;
  }
  try {
    const value = (storage ?? window.localStorage).getItem(PREFIX + id);
    return value && TOKEN.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function retainHostedAuthority(
  id: string,
  token: string,
  storage: Pick<Storage, "setItem">
): void {
  if (!(isHostedId(id) && TOKEN.test(token))) {
    throw new Error("Invalid hosted authority.");
  }
  storage.setItem(PREFIX + id, token);
}
