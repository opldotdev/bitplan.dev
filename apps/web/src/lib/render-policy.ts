/**
 * Policy for plans rendered inside the viewer's sandboxed iframe.
 *
 * Scripts on, network off. The frame has an opaque origin, so a plan cannot
 * reach bitplan.dev storage or the wallet. This policy closes what the sandbox
 * leaves open: no fetch, no forms, no nested frames, no navigation targets.
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
const HEAD_OPEN = /<head(\s[^>]*)?>/i;

/** Insert the render policy as the first element of the document head. */
export function withRenderPolicy(html: string): string {
  const match = HEAD_OPEN.exec(html);
  if (match) {
    const at = match.index + match[0].length;
    return `${html.slice(0, at)}${POLICY_TAG}${html.slice(at)}`;
  }
  return `${POLICY_TAG}${html}`;
}
