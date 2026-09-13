import { withRenderPolicy } from "./render-policy";

const PUBLIC_PLAN_ID = /^(?:h_[a-zA-Z0-9_-]{20}|[0-9a-f]{64}_\d+)$/;

/** Geometry only crosses this boundary. Never inject annotation content or credentials. */
export function withAnnotationBridge(
  html: string,
  collaboration = true,
  appearanceCss = "",
  browserMenu = false,
  planId = ""
): string {
  const publicId = PUBLIC_PLAN_ID.test(planId) ? planId : "";
  const script = `;(${installGeometryBridge.toString()})(${collaboration},${browserMenu},${JSON.stringify(publicId)});`;
  const tag = `<script>${script.replaceAll("</script", "<\\/script")}</script>`;
  // Only the host's validated preset compiler supplies this style text.
  return withRenderPolicy(
    html,
    tag +
      (appearanceCss
        ? `<style>${appearanceCss.replaceAll("</style", "<\\/style")}</style>`
        : "")
  );
}

function installGeometryBridge(
  collaboration: boolean,
  browserMenu: boolean,
  planId: string
) {
  if (planId) {
    document.documentElement.setAttribute("data-bitplan-id", planId);
  }
  let picking = false;
  function linkFor(target: EventTarget | null) {
    const link = target instanceof Element ? target.closest("a[href]") : null;
    const href = link?.getAttribute("href")?.trim();
    if (!href) {
      return null;
    }
    if (href.startsWith("#")) {
      return href;
    }
    try {
      const url = new URL(href, document.baseURI);
      return ["https:", "http:", "mailto:"].includes(url.protocol)
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  // Keep navigation native so user activation, modifier keys, and browser popup rules work.
  for (const type of ["click", "auxclick"] as const) {
    document.addEventListener(
      type,
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: native link handling keeps validation, local anchors, and popup hardening in one captured callback
      (event) => {
        if (picking) {
          event.preventDefault();
          return;
        }
        const link =
          event.target instanceof Element
            ? event.target.closest("a[href]")
            : null;
        if (!link) {
          return;
        }
        const href = linkFor(link);
        if (!href) {
          event.preventDefault();
          return;
        }
        if (href.startsWith("#")) {
          // srcdoc inherits the host URL as its base. Native # navigation can
          // load the entire viewer inside this frame instead of scrolling.
          event.preventDefault();
          let id = href.slice(1);
          try {
            id = decodeURIComponent(id);
          } catch {
            // A literal percent sign may be part of the author's element ID.
          }
          if (id) {
            const destination = document.getElementById(id);
            destination?.scrollIntoView({ block: "start" });
            if (destination) {
              if (!destination.hasAttribute("tabindex")) {
                destination.setAttribute("tabindex", "-1");
              }
              destination.focus({ preventScroll: true });
            }
          } else {
            window.scrollTo({ left: 0, top: 0 });
          }
          return;
        }
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      },
      true
    );
  }
  if (!collaboration) {
    return;
  }
  // Create and transfer the port before the parser reaches untrusted markup.
  // Replacing or navigating the document can only destroy this endpoint; an
  // untrusted replacement never receives authenticated activity authority.
  const addTrustedListener = EventTarget.prototype.addEventListener;
  const readEventTrusted =
    Object.getOwnPropertyDescriptor(new Event("bitplan-probe"), "isTrusted")
      ?.get ??
    Object.getOwnPropertyDescriptor(Event.prototype, "isTrusted")?.get;
  const startPort = MessagePort.prototype.start;
  const postPortMessage = MessagePort.prototype.postMessage;
  const readMessageData = Object.getOwnPropertyDescriptor(
    MessageEvent.prototype,
    "data"
  )?.get;
  const channel = new MessageChannel();
  const bridgePort = channel.port1;
  let anchors: {
    id: string;
    anchor: {
      elementId?: string;
      domPath?: string;
      quote?: { exact: string };
      point: { x: number; y: number };
    };
  }[] = [];
  let scheduled = false;
  let lastPointer = 0;
  let pointerPoint: { x: number; y: number } | null = null;
  const send = (type: string, payload: unknown) =>
    postPortMessage.call(bridgePort, { payload, type });
  const trustedActivity = (event: Event) =>
    readEventTrusted?.call(event) === true;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const selectedText = () =>
    window.getSelection?.()?.toString().slice(0, 32_000) ?? "";
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keep point, ID, quote and structural fallback resolution together inside the serialized bridge
  function anchorFor(target: EventTarget | null, x: number, y: number) {
    let element: Element | null = null;
    if (target instanceof Element) {
      element = picking
        ? target
        : target.closest("[id],p,li,h1,h2,h3,h4,pre,blockquote,figure,section");
    }
    const documentPoint = () => ({
      point: {
        x: clamp(
          (x + scrollX) / Math.max(1, document.documentElement.scrollWidth)
        ),
        y: clamp(
          (y + scrollY) / Math.max(1, document.documentElement.scrollHeight)
        ),
      },
    });
    if (!element) {
      return documentPoint();
    }
    if (
      picking &&
      !element.id &&
      element !== document.body &&
      element !== document.documentElement
    ) {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.body && parts.length < 64) {
        const parentElement: Element | null = current.parentElement;
        if (!parentElement) {
          break;
        }
        parts.unshift(
          `${current.tagName.toLowerCase()}:nth-child(${[...parentElement.children].indexOf(current) + 1})`
        );
        current = parentElement;
      }
      if (current === document.body && parts.length) {
        const rect = element.getBoundingClientRect();
        return {
          domPath: `body>${parts.join(">")}`,
          point: {
            x: clamp((x - rect.left) / Math.max(1, rect.width)),
            y: clamp((y - rect.top) / Math.max(1, rect.height)),
          },
        };
      }
    }
    const rect = element.getBoundingClientRect();
    const exact = element.textContent?.trim().slice(0, 8000);
    // Blank space and ambiguous text use document coordinates, never an unresolvable body quote.
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      return documentPoint();
    }
    const candidates = [
      ...document.querySelectorAll(
        element.id ? "[id]" : "p,li,h1,h2,h3,h4,pre,blockquote,figure,section"
      ),
    ];
    if (
      candidates.filter((el) =>
        element.id
          ? el.id === element.id
          : el.textContent?.trim().slice(0, 8000) === exact
      ).length !== 1
    ) {
      return documentPoint();
    }
    return {
      ...(element.id ? { elementId: element.id } : {}),
      ...(!element.id && exact
        ? { quote: { exact, prefix: "", suffix: "" } }
        : {}),
      point: {
        x: clamp((x - rect.left) / Math.max(1, rect.width)),
        y: clamp((y - rect.top) / Math.max(1, rect.height)),
      },
    };
  }
  function locate(anchor: (typeof anchors)[number]["anchor"]) {
    let element: Element | null = null;
    if (anchor.elementId) {
      const matches = [...document.querySelectorAll("[id]")].filter(
        (el) => el.id === anchor.elementId
      );
      if (matches.length !== 1) {
        return null;
      }
      element = matches[0] ?? null;
    } else if (
      anchor.domPath &&
      // biome-ignore lint/performance/useTopLevelRegex: this function is serialized into an isolated iframe
      /^body(?:>[a-z][a-z0-9-]*:nth-child\([1-9][0-9]{0,5}\)){1,64}$/.test(
        anchor.domPath
      )
    ) {
      element = document.querySelector(anchor.domPath);
    } else if (anchor.quote?.exact) {
      const matches = [
        ...document.querySelectorAll(
          "p,li,h1,h2,h3,h4,pre,blockquote,figure,section"
        ),
      ].filter(
        (el) => el.textContent?.trim().slice(0, 8000) === anchor.quote?.exact
      );
      if (matches.length !== 1) {
        return null;
      }
      element = matches[0] ?? null;
    } else {
      return {
        x: document.documentElement.scrollWidth * anchor.point.x - scrollX,
        y: document.documentElement.scrollHeight * anchor.point.y - scrollY,
      };
    }
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return {
      bounds: {
        height: rect.height,
        width: rect.width,
        x: rect.left,
        y: rect.top,
      },
      x: rect.left + rect.width * anchor.point.x,
      y: rect.top + rect.height * anchor.point.y,
    };
  }
  function geometry() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      send(
        "positions",
        anchors.map((item) => ({ id: item.id, position: locate(item.anchor) }))
      );
    });
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one private-port dispatcher validates each message shape before changing bridge state
  function receive(data: unknown) {
    if (!(data && typeof data === "object" && "type" in data)) {
      return;
    }
    if (data.type === "pick") {
      picking = "payload" in data && data.payload === true;
      document.documentElement.style.cursor = picking
        ? 'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22%3E%3Cpath d=%22M15 3l6 6-3 3-2-2-9 9-4 1 1-4 9-9-2-2z%22 fill=%22white%22 stroke=%22black%22 stroke-width=%222%22/%3E%3C/svg%3E") 3 21, crosshair'
        : "";
      return;
    }
    if (
      data.type === "open-tools" &&
      pointerPoint &&
      !picking &&
      !browserMenu
    ) {
      const { x, y } = pointerPoint;
      const target = document.elementFromPoint(x, y);
      send("context", {
        anchor: anchorFor(target, x, y),
        href: linkFor(target),
        selection: selectedText(),
        x,
        y,
      });
      return;
    }
    if (data.type === "point" || data.type === "resolve-anchor") {
      const payload = "payload" in data ? data.payload : undefined;
      const point =
        payload && typeof payload === "object"
          ? (payload as { x?: unknown; y?: unknown })
          : {};
      const x = typeof point.x === "number" ? point.x : Number.NaN;
      const y = typeof point.y === "number" ? point.y : Number.NaN;
      if (
        !(Number.isFinite(x) && Number.isFinite(y)) ||
        x < 0 ||
        y < 0 ||
        x > innerWidth ||
        y > innerHeight
      ) {
        return;
      }
      const anchor = anchorFor(document.elementFromPoint(x, y), x, y);
      if (data.type === "resolve-anchor") {
        send("resolved-anchor", { anchor });
        return;
      }
      send("click", { anchor });
      send("context", {
        anchor,
        href: linkFor(document.elementFromPoint(x, y)),
        selection: selectedText(),
        x,
        y,
      });
      return;
    }
    if (
      data.type !== "anchors" ||
      !("payload" in data && Array.isArray(data.payload)) ||
      data.payload.length > 1600
    ) {
      return;
    }
    anchors = data.payload;
    geometry();
  }
  addTrustedListener.call(
    bridgePort,
    "message",
    (rawEvent: Event) => {
      receive(readMessageData?.call(rawEvent as MessageEvent));
    },
    true
  );
  startPort.call(bridgePort);
  const notifyParent = parent.postMessage.bind(parent);
  notifyParent({ type: "bitplan-geometry-ready/1" }, "*", [channel.port2]);
  window.addEventListener("scroll", geometry, true);
  window.addEventListener("resize", geometry);
  window.addEventListener("load", geometry);
  document.addEventListener("contextmenu", (event) => {
    if (!trustedActivity(event)) {
      return;
    }
    send("click", {
      anchor: anchorFor(event.target, event.clientX, event.clientY),
    });
    if (browserMenu) {
      return;
    }
    event.preventDefault();
    send("context", {
      anchor: anchorFor(event.target, event.clientX, event.clientY),
      href: linkFor(event.target),
      selection: selectedText(),
      x: event.clientX,
      y: event.clientY,
    });
  });
  document.addEventListener("pointermove", (event) => {
    if (!trustedActivity(event)) {
      return;
    }
    pointerPoint = { x: event.clientX, y: event.clientY };
    if (performance.now() - lastPointer < 250) {
      return;
    }
    lastPointer = performance.now();
    send("pointer", {
      anchor: anchorFor(event.target, event.clientX, event.clientY),
      selecting: picking,
    });
  });
  document.addEventListener("pointerleave", (event) => {
    if (!trustedActivity(event)) {
      return;
    }
    pointerPoint = null;
    if (picking) {
      send("hover-end", {});
    }
  });
  // Browser automation clicks emit the same events as human clicks. Never invent a location.
  for (const type of ["click", "auxclick"] as const) {
    document.addEventListener(
      type,
      (event) => {
        if (!trustedActivity(event) || event.button === 2) {
          return; // Right clicks are recorded by contextmenu, even when its native menu is prevented.
        }
        if (picking) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const anchor = anchorFor(event.target, event.clientX, event.clientY);
          picking = false;
          document.documentElement.style.cursor = "";
          send("picked", { anchor });
          return;
        }
        send("click", {
          anchor: anchorFor(event.target, event.clientX, event.clientY),
        });
      },
      true
    );
  }
  document.addEventListener("keydown", (event) => {
    if (
      trustedActivity(event) &&
      event.key === "Shift" &&
      !event.repeat &&
      !(
        event.target instanceof Element &&
        event.target.closest("input,textarea,select,[contenteditable=true]")
      ) &&
      pointerPoint &&
      !picking &&
      !browserMenu
    ) {
      const { x, y } = pointerPoint;
      const target = document.elementFromPoint(x, y);
      send("context", {
        anchor: anchorFor(target, x, y),
        href: linkFor(target),
        selection: selectedText(),
        x,
        y,
      });
      return;
    }
    if (trustedActivity(event) && picking && event.key === "Escape") {
      picking = false;
      document.documentElement.style.cursor = "";
      send("pick-cancel", {});
      return;
    }
    if (trustedActivity(event) && event.shiftKey && event.key === "F10") {
      event.preventDefault();
      const rect = document.activeElement?.getBoundingClientRect();
      const x = rect?.left ?? 24;
      const y = rect?.top ?? 24;
      send("context", {
        anchor: anchorFor(document.activeElement, x, y),
        href: linkFor(document.activeElement),
        selection: selectedText(),
        x,
        y,
      });
    }
  });
  window.addEventListener("DOMContentLoaded", () => {
    new ResizeObserver(geometry).observe(document.body);
    geometry();
  });
}
