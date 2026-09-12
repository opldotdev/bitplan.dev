/**
 * Policy for plans rendered inside the viewer's sandboxed iframe.
 *
 * Scripts on, active network APIs off. The frame has an opaque origin, so a
 * plan cannot reach bitplan.dev storage or the wallet. This policy closes what
 * the sandbox leaves open: no fetch, no forms, no nested frames. Passive media
 * assets may load because plans use immutable ORDFS resources. A trusted first
 * base element prevents srcdoc from inheriting secret-bearing viewer fragments.
 */
export const RENDER_POLICY = [
  "default-src 'none'",
  "img-src * data: blob:",
  "media-src * data: blob:",
  "font-src * data:",
  "style-src 'unsafe-inline' data:",
  "script-src 'unsafe-inline' blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "base-uri https://bitplan.dev",
].join("; ");

const POLICY_TAG = `<meta http-equiv="Content-Security-Policy" content="${RENDER_POLICY}">`;
export const RENDER_BASE_URL = "https://bitplan.dev/";
const BASE_TAG = `<base href="${RENDER_BASE_URL}">`;
const HTML5_DOCTYPE = /^<!doctype html\s*>/i;

/** Put trusted controls before every byte of untrusted plan markup. */
export function withRenderPolicy(html: string, trustedHead = ""): string {
  const content = html.replace(HTML5_DOCTYPE, "");
  return `<!doctype html>${POLICY_TAG}${BASE_TAG}${trustedHead}${content}`;
}
