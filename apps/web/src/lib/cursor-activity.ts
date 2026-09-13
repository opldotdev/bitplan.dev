/** Presence means connected, not moving. Keep the avatar but hide an idle arrow. */
export function cursorIsActive(
  online: boolean,
  updatedAt: number,
  now: number
): boolean {
  return online && updatedAt > 0 && now - updatedAt < 30_000;
}

/** Age of the last cursor activity, using the viewer's existing refresh clock. */
export function cursorStatus(
  cursor: {
    activity?: "read" | "edit" | "annotate";
    online: boolean;
    updatedAt: number;
  },
  now: number
): string {
  if (cursor.activity && cursor.online && now - cursor.updatedAt < 6000) {
    return {
      annotate: "Agent annotation",
      edit: "Agent edit",
      read: "Agent read",
    }[cursor.activity];
  }
  return cursorIsActive(cursor.online, cursor.updatedAt, now)
    ? "connected"
    : cursorTimeAgo(cursor.updatedAt, now);
}

/** Age of the last cursor activity, using the viewer's existing refresh clock. */
export function cursorTimeAgo(updatedAt: number, now: number): string {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return "Time unavailable";
  }
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
