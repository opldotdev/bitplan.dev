/**
 * Policy for plans rendered inside the viewer's sandboxed iframe.
 *
 * Scripts on, network off. The frame has an opaque origin, so a plan cannot
 * reach bitplan.dev storage or the wallet. This policy closes what the sandbox
 * leaves open: no fetch, no forms, no nested frames. User-activated external
 * links open in separate tabs; section links scroll within the document.
 * Images and fonts may load from anywhere because most plan assets are
 * immutable on-chain files served by ORDFS gateways.
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
  "base-uri 'none'",
].join("; ");

const POLICY_TAG = `<meta http-equiv="Content-Security-Policy" content="${RENDER_POLICY}">`;
const HTML5_DOCTYPE = /^<!doctype html\s*>/i;

/** Put trusted controls before every byte of untrusted plan markup. */
export function withRenderPolicy(html: string, trustedHead = ""): string {
  const content = html.replace(HTML5_DOCTYPE, "");
  return `<!doctype html>${POLICY_TAG}${trustedHead}${content}`;
}
