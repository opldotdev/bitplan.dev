export interface PlanAppearance {
  dark: { paper: string; ink: string; muted: string; accent: string };
  layout: "brief" | "terminal" | "blank";
  light: { paper: string; ink: string; muted: string; accent: string };
  name: string;
}

const APPEARANCE_NAME = /^[\p{L}\p{N} _-]{1,40}$/u;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const PLAN_APPEARANCES: PlanAppearance[] = [
  {
    dark: {
      accent: "#c2a586",
      ink: "#eee9de",
      muted: "#aaa499",
      paper: "#181817",
    },
    layout: "brief",
    light: {
      accent: "#79563c",
      ink: "#24221e",
      muted: "#69645b",
      paper: "#faf7ef",
    },
    name: "Brief",
  },
  {
    dark: {
      accent: "#839b83",
      ink: "#eeede7",
      muted: "#a8afa8",
      paper: "#111311",
    },
    layout: "terminal",
    light: {
      accent: "#526f56",
      ink: "#171b18",
      muted: "#555d57",
      paper: "#fafbf9",
    },
    name: "Terminal",
  },
  {
    dark: {
      accent: "#c5cec7",
      ink: "#f0f0e9",
      muted: "#adb5af",
      paper: "#202522",
    },
    layout: "blank",
    light: {
      accent: "#555555",
      ink: "#202020",
      muted: "#666666",
      paper: "#ffffff",
    },
    name: "Blank",
  },
];

/** Presets are data, never uploaded CSS, HTML, scripts, or remote URLs. */
export function parsePlanAppearance(value: unknown): PlanAppearance {
  if (!value || typeof value !== "object") {
    throw new Error("Choose a BitPlan appearance JSON file.");
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.name !== "string" ||
    !APPEARANCE_NAME.test(input.name) ||
    !["brief", "terminal", "blank"].includes(String(input.layout))
  ) {
    throw new Error(
      "A preset needs a name and a brief, terminal, or blank layout."
    );
  }
  const palette = (rawPalette: unknown) => {
    if (!rawPalette || typeof rawPalette !== "object") {
      throw new Error("Include light and dark palettes.");
    }
    const source = rawPalette as Record<string, unknown>;
    const color = (key: string) => {
      if (typeof source[key] !== "string" || !HEX_COLOR.test(source[key])) {
        throw new Error(
          "Use six-digit hex colors for paper, ink, muted, and accent."
        );
      }
      return source[key];
    };
    return {
      accent: color("accent"),
      ink: color("ink"),
      muted: color("muted"),
      paper: color("paper"),
    };
  };
  return {
    dark: palette(input.dark),
    layout: input.layout as PlanAppearance["layout"],
    light: palette(input.light),
    name: input.name,
  };
}

/** Ordered-dither ramp adapted from Dither Kit's static DitherGradient painter.
 * https://github.com/Boring-Software-Inc/dither-kit/blob/1e7faee9aa252e499651e6736ed65f7a07d9a6bd/registry/dither-kit/gradient.tsx
 * Upstream package declares MIT. No React/chart runtime or network is needed.
 */
function ditherArt(ink: string) {
  const bayer = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  let points = "";
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 112; x += 1) {
      const ridge = 30 + 12 * Math.sin(x / 16) + 7 * Math.cos(x / 8);
      const density = Math.max(0, 1 - Math.abs(y - ridge) / 21) * (1 - y / 100);
      const threshold = bayer[y % 4]?.[x % 4] ?? 0;
      if (density > (threshold + 0.5) / 16) {
        points += `M${x * 3} ${y * 3}h1v1h-1z`;
      }
    }
  }
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 336 192"><path fill="${ink}" d="${points}"/></svg>`)}")`;
}

/** View-only CSS: never changes source text, IDs, media, or annotation targets. */
export function planAppearanceCss(raw: PlanAppearance): string {
  const preset = parsePlanAppearance(raw);
  const tokens = (p: PlanAppearance["light"]) =>
    `--bp-paper:${p.paper};--bp-ink:${p.ink};--bp-muted:${p.muted};--bp-accent:${p.accent};--bp-art:${preset.layout === "terminal" ? ditherArt(p.ink) : "none"};`;
  if (preset.layout === "blank") {
    return `:root{${tokens(preset.light)}}@media(prefers-color-scheme:dark){:root{${tokens(preset.dark)}}}
    :root{--paper:var(--bp-paper)!important;--ink:var(--bp-ink)!important;--muted:var(--bp-muted)!important;--accent:var(--bp-accent)!important;--surface:var(--bp-paper)!important;--wash:var(--bp-paper)!important;--line:color-mix(in srgb,var(--bp-ink) 20%,transparent)!important}
    html,body{background:var(--bp-paper)!important;color:var(--bp-ink)!important}
    body{font-family:system-ui,sans-serif!important;line-height:1.65!important}
    h1,h2,h3{font-family:Georgia,serif!important;color:var(--bp-ink)!important}
    a{color:var(--bp-accent)!important}
    .hero{background-image:none!important}
    `;
  }
  return `:root{${tokens(preset.light)}}@media(prefers-color-scheme:dark){:root{${tokens(preset.dark)}}}
  :root{--paper:var(--bp-paper)!important;--ink:var(--bp-ink)!important;--muted:var(--bp-muted)!important;--accent:var(--bp-accent)!important;--line:color-mix(in srgb,var(--bp-ink) 23%,transparent)!important;--surface:color-mix(in srgb,var(--bp-ink) 5%,var(--bp-paper))!important;--wash:var(--surface)!important;color-scheme:light dark}
  html,body{background:var(--bp-paper)!important;color:var(--bp-ink)!important}
  body{font-family:${preset.layout === "terminal" ? "ui-monospace,monospace" : "Georgia,serif"}!important;font-size:16px!important;line-height:1.65!important}
  main{max-width:1240px!important;margin-inline:auto!important;padding:48px clamp(20px,4vw,64px)!important}
  h1,h2,h3{font-family:Georgia,serif!important;font-weight:400!important;color:var(--bp-ink)!important;text-transform:none!important;letter-spacing:-.035em!important}
  h1{font-size:clamp(44px,6vw,84px)!important;line-height:1.08!important;max-width:18ch}
  h2{font-size:clamp(28px,3.3vw,42px)!important;line-height:1.2!important}
  p,li{max-width:68ch}a{color:var(--bp-accent)!important}pre,code{font-family:ui-monospace,monospace!important}
  .hero{border-top:0!important;gap:36px!important;padding-block:16px 48px!important}.lede{font-family:Georgia,serif!important;font-size:clamp(19px,2vw,25px)!important;line-height:1.5!important}
  .reading{gap:32px!important}.rail,.caption,figcaption,.kicker,.status{font-family:system-ui,sans-serif!important;text-transform:none!important;letter-spacing:normal!important;color:var(--bp-muted)!important}
  .note{background:var(--surface)!important;border:0!important;border-left:2px solid var(--bp-accent)!important;padding:20px!important}
  ${preset.layout === "terminal" ? ".hero{background-image:var(--bp-art);background-position:right top;background-size:32% auto;background-repeat:no-repeat}.hero:has(figure){background-image:none}.hero img{filter:grayscale(1)!important}.article section{border-color:var(--line)!important}.steps strong{font-weight:600}.flow{font-family:ui-monospace,monospace}" : ".columns{display:grid;grid-template-columns:1fr 1fr;gap:48px}.columns>div+div{border-left:1px solid var(--line);padding-left:40px}.columns h2{border-bottom:1px solid var(--line);padding-bottom:14px}"}
  @media(max-width:650px){main{padding:24px 20px!important}.columns{display:block}.columns>div+div{border-left:0;padding-left:0}.hero{background-image:none;padding-right:0!important}.reading{display:block!important}.rail{position:static!important}.margin{border-left:0!important;padding-left:0!important}}
  `;
}
