/** Local, self-contained sticker art. No remote image or model requests. */
export const STICKERS = [
  { name: "Planning papers", src: "/planning-sticker.png" },
  { name: "Launch", src: "/stickers/launch.png" },
  { name: "Bright idea", src: "/stickers/idea.png" },
  { name: "Clear goal", src: "/stickers/goal.png" },
] as const;

export const GENERATION_PROMPT_LIMIT = 1200;

export function pendingSticker(prompt: string) {
  const description = prompt.trim();
  if (!description || description.length > GENERATION_PROMPT_LIMIT) {
    throw new Error("Describe the image in 1–1,200 characters.");
  }
  // The user prompt stays in plain-text alt, never interpolated into SVG markup.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><rect x="2" y="2" width="356" height="236" rx="24" fill="#eee9df" stroke="#928676" stroke-width="2" stroke-dasharray="8 6"/><path d="m180 40 8 24 24 8-24 8-8 24-8-24-24-8 24-8Z" fill="#b36f43"/><text x="180" y="144" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#332f28">Image requested</text><text x="180" y="179" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#726a5f">Waiting for your agent</text></svg>';
  return {
    alt: `Pending image generation request: ${description}\nAgent: generate this image, then replace this placeholder at the same annotation anchor. This request has not run a model.`,
    dataUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
  };
}
