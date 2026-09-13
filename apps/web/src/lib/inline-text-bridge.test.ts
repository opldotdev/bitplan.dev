import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { installInlineTextBridge } from "./inline-text-bridge";

function bridge() {
  const messages: {
    type: string;
    payload: { deleted?: boolean; path?: string; text?: string };
  }[] = [];
  const handlers = new Map<string, (event: object) => void>();
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  let receive: (event: MessageEvent) => void = () => undefined;
  const body = { children: [] as object[] };
  const attributes = new Map<string, string>();
  const styles = new Map<string, string>();
  let removed = false;
  const element = {
    blur: () => undefined,
    children: [],
    closest: () => null,
    focus: () => undefined,
    parentElement: body,
    removeAttribute: (key: string) => attributes.delete(key),
    replaceWith: () => {
      removed = true;
    },
    setAttribute: (key: string, value: string) => attributes.set(key, value),
    style: {
      removeProperty: (key: string) => styles.delete(key),
      setProperty: (key: string, value: string) => styles.set(key, value),
    },
    tagName: "P",
    textContent: "Original",
  };
  body.children.push(element);
  const trustedEvents = new WeakSet<object>();
  class TrustedEvent {
    constructor() {
      Object.defineProperty(this, "isTrusted", {
        get() {
          return trustedEvents.has(this);
        },
      });
    }
  }
  class Port {
    addEventListener(_type: string, callback: typeof receive) {
      receive = callback;
    }
    postMessage(value: (typeof messages)[number]) {
      messages.push(value);
    }
    start() {
      /* The mock delivers messages synchronously. */
    }
  }
  runInNewContext(`(${installInlineTextBridge.toString()})()`, {
    clearTimeout: (id: number) => timers.delete(id),
    document: {
      addEventListener: (name: string, callback: (event: object) => void) =>
        handlers.set(name, callback),
      body,
      createComment: () => ({
        replaceWith: () => {
          removed = false;
        },
      }),
      createElement: () => ({ textContent: "" }),
      head: { append: () => undefined },
      querySelectorAll: () => [element],
    },
    Element: class {},
    Event: TrustedEvent,
    MessageChannel: class {
      port1 = new Port();
      port2 = new Port();
    },
    MessageEvent,
    MessagePort: Port,
    parent: { postMessage: () => undefined },
    setTimeout: (callback: () => void) => {
      nextTimer += 1;
      const id = nextTimer;
      timers.set(id, callback);
      return id;
    },
    window: {
      addEventListener: (name: string, callback: (event: object) => void) =>
        handlers.set(name, callback),
    },
  });
  handlers.get("DOMContentLoaded")?.({});
  const send = (type: string, payload: unknown) =>
    receive(new MessageEvent("message", { data: { payload, type } }));
  send("mode", true);
  return {
    attributes,
    element,
    event(name: string, options: object = {}, trusted = true) {
      const event = Object.assign(new TrustedEvent(), {
        preventDefault() {
          /* No browser default in this harness. */
        },
        target: element,
        ...options,
      });
      if (trusted) {
        trustedEvents.add(event);
      }
      handlers.get(name)?.(event);
    },
    flush() {
      const pending = [...timers.values()];
      timers.clear();
      for (const callback of pending) {
        callback();
      }
    },
    input(text: string, trusted = true) {
      element.textContent = text;
      const event = Object.assign(new TrustedEvent(), { target: element });
      if (trusted) {
        trustedEvents.add(event);
      }
      handlers.get("input")?.(event);
    },
    messages,
    get removed() {
      return removed;
    },
    send,
    styles,
  };
}

test("edited text uses author color and only labels another participant, clearing stale attribution", () => {
  const view = bridge();
  const author = {
    color: "hsl(120 70% 65%)",
    name: "Tina",
    other: true,
    path: "body>p:nth-child(1)",
  };
  view.send("attribution", [author]);
  expect(view.styles.get("--bitplan-editor-color")).toBe(author.color);
  expect(view.attributes.get("data-bitplan-editor")).toBe("Edited by Tina");
  view.send("attribution", [{ ...author, other: false }]);
  expect(view.attributes.has("data-bitplan-editor")).toBe(false);
  view.send("attribution", [{ ...author, color: "url(https://example.com)" }]);
  expect(view.styles.size).toBe(0);
  view.send("attribution", []);
  expect(view.attributes.has("data-bitplan-editor")).toBe(false);
});

test("serialized bridge reports drafts immediately and restores without overwriting shared text", () => {
  const first = bridge();
  first.input("Unsaved draft");
  const draft = first.messages.find((message) => message.type === "draft");
  expect(draft?.payload.text).toBe("Unsaved draft");
  expect(first.messages.some((message) => message.type === "edit")).toBe(false);
  const restored = bridge();
  restored.send("restore", [draft?.payload]);
  expect(restored.element.textContent).toBe("Unsaved draft");
  restored.input("Keep working");
  restored.flush();
  expect(restored.messages.some((message) => message.type === "edit")).toBe(
    false
  );
  restored.send("blocks", [
    {
      original: "Original",
      path: "body>p:nth-child(1)",
      revision: 2,
      text: "Remote",
    },
  ]);
  expect(restored.element.textContent).toBe("Keep working");
  restored.send("discard", null);
  expect(restored.element.textContent).toBe("Remote");
  expect(
    restored.messages.some((message) => message.type === "discarded")
  ).toBe(true);
});

test("click selects, second click edits, Escape clears, and deletion survives remote replay", () => {
  const instance = bridge();
  instance.event("click");
  expect(instance.attributes.has("data-bitplan-selected")).toBe(true);
  expect(instance.attributes.has("contenteditable")).toBe(false);
  instance.event("click");
  expect(instance.attributes.get("contenteditable")).toBe("plaintext-only");
  instance.event("keydown", { key: "Escape" });
  expect(instance.attributes.has("data-bitplan-selected")).toBe(false);
  expect(instance.attributes.has("contenteditable")).toBe(false);
  instance.event("click", { detail: 2 });
  expect(instance.attributes.has("contenteditable")).toBe(true);
  instance.send("clear-selection", null);
  instance.event("click");
  instance.event("keydown", { key: "Delete" }, false);
  expect(instance.removed).toBe(false);
  instance.event("keydown", { key: "Delete" });
  expect(instance.removed).toBe(true);
  const edit = instance.messages.find((message) => message.type === "edit");
  expect(edit?.payload.deleted).toBe(true);
  instance.send("saved", { ...edit?.payload, revision: 1 });
  instance.event("keydown", { key: "z", metaKey: true });
  expect(instance.removed).toBe(false);
  expect(instance.element.textContent).toBe("Original");
  expect(
    instance.messages.filter((message) => message.type === "edit").at(-1)
      ?.payload.deleted
  ).toBe(false);
  const reader = bridge();
  reader.send("blocks", [{ ...edit?.payload, revision: 1 }]);
  expect(reader.removed).toBe(true);
  reader.send("blocks", [
    { ...edit?.payload, deleted: false, revision: 2, text: "Original" },
  ]);
  expect(reader.removed).toBe(false);
  expect(reader.element.textContent).toBe("Original");
});

test("restore validates original text and retains newer local drafts across save acknowledgements", () => {
  const instance = bridge();
  const block = {
    original: "Wrong",
    path: "body>p:nth-child(1)",
    revision: 0,
    text: "No",
  };
  instance.send("restore", [
    null,
    block,
    { ...block, original: "Original", text: "x".repeat(64_001) },
  ]);
  expect(instance.element.textContent).toBe("Original");
  instance.input("Synthetic", false);
  expect(instance.messages.some((message) => message.type === "draft")).toBe(
    false
  );
  instance.input("First");
  instance.flush();
  instance.input("Second");
  instance.send("saved", { path: block.path, revision: 1, text: "First" });
  expect(instance.messages.some((message) => message.type === "clean")).toBe(
    false
  );
  instance.send("saved", { path: block.path, revision: 2, text: "Second" });
  expect(
    instance.messages.find((message) => message.type === "clean")?.payload.text
  ).toBe("Second");
});
