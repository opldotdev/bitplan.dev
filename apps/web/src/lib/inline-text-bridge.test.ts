import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { installInlineTextBridge } from "./inline-text-bridge";

function bridge() {
  const messages: {
    type: string;
    payload: { path?: string; text?: string };
  }[] = [];
  const handlers = new Map<string, (event: object) => void>();
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  let receive: (event: MessageEvent) => void = () => undefined;
  const body = { children: [] as object[] };
  const element = {
    blur: () => undefined,
    children: [],
    closest: () => null,
    parentElement: body,
    removeAttribute: () => undefined,
    setAttribute: () => undefined,
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
      createElement: () => ({ textContent: "" }),
      head: { append: () => undefined },
      querySelectorAll: () => [element],
    },
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
    element,
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
    send,
  };
}

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
