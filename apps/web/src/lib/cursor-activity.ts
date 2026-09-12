/** Presence means connected, not moving. Keep the avatar but hide an idle arrow. */
export function cursorIsActive(
  online: boolean,
  updatedAt: number,
  now: number
): boolean {
  return online && updatedAt > 0 && now - updatedAt < 30_000;
}
