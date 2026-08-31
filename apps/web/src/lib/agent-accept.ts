export function quality(accept: string, type: string): number | null {
  const lower = accept.toLowerCase();
  if (lower.includes("*/*") && !lower.includes(type)) {
    return null;
  }
  const parts = accept.split(",").map((part) => part.trim());
  for (const part of parts) {
    const [media, ...params] = part.split(";").map((item) => item.trim());
    if (media.toLowerCase() !== type) {
      continue;
    }
    const q = params.find((param) => param.startsWith("q="));
    return q ? Number(q.slice(2)) : 1;
  }
  return lower.includes(type) ? 1 : null;
}

export function prefers(accept: string, type: string, over: string): boolean {
  const wanted = quality(accept, type);
  if (wanted === null) {
    return false;
  }
  const other = quality(accept, over);
  return other === null || wanted > other;
}

export function isDocumentPath(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return base === "" || !base.includes(".");
}

export function isApiPath(path: string): boolean {
  return (
    path === "/api" || path.startsWith("/api/") || path.startsWith("/ordfs")
  );
}

export function wantsJsonNotFound(accept: string): boolean {
  return (
    prefers(accept, "application/json", "text/html") ||
    prefers(accept, "application/problem+json", "text/html")
  );
}

export function wantsMarkdownNotFound(accept: string): boolean {
  if (prefers(accept, "text/html", "text/markdown")) {
    return false;
  }
  return true;
}
