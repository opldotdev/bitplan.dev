/** Serialized before plan scripts. This private channel accepts only bounded plain-text edits. */
export function installInlineTextBridge() {
  const channel = new MessageChannel();
  const port = channel.port1;
  const post = MessagePort.prototype.postMessage;
  const read = Object.getOwnPropertyDescriptor(
    MessageEvent.prototype,
    "data"
  )?.get;
  const trusted =
    Object.getOwnPropertyDescriptor(new Event("probe"), "isTrusted")?.get ??
    Object.getOwnPropertyDescriptor(Event.prototype, "isTrusted")?.get;
  const send = (type: string, payload: unknown) =>
    post.call(port, { payload, type });
  interface Block {
    conflict: boolean;
    dirty: boolean;
    element: HTMLElement;
    original: string;
    pending: boolean;
    remote?: { text: string; revision: number };
    revision: number;
    text: string;
    timer?: ReturnType<typeof setTimeout>;
  }
  const blocks = new Map<string, Block>();
  let enabled = false;
  function collect() {
    if (blocks.size || !document.body) {
      return;
    }
    for (const element of document.querySelectorAll<HTMLElement>(
      "h1,h2,h3,h4,h5,h6,p,li,span,strong,em,b,i,code,td,th,dt,dd,blockquote"
    )) {
      if (
        element.children.length ||
        !element.textContent?.trim() ||
        element.textContent.length > 16_000 ||
        element.closest(
          "a,button,input,textarea,select,[contenteditable],script,style,svg"
        )
      ) {
        continue;
      }
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
      if (current !== document.body) {
        continue;
      }
      blocks.set(`body>${parts.join(">")}`, {
        conflict: false,
        dirty: false,
        element,
        original: element.textContent,
        pending: false,
        revision: 0,
        text: element.textContent,
      });
    }
  }
  function save(path: string, block: Block) {
    if (block.pending || block.conflict || !block.dirty) {
      return;
    }
    const text = block.element.textContent ?? "";
    if (text.length > 16_000) {
      send(
        "error",
        "Keep this passage under 16,000 characters. Your text is still here."
      );
      return;
    }
    block.pending = true;
    send("edit", {
      original: block.original,
      path,
      revision: block.revision,
      text,
    });
  }
  function mode() {
    for (const block of blocks.values()) {
      if (enabled) {
        block.element.setAttribute("contenteditable", "plaintext-only");
        block.element.setAttribute("data-bitplan-editable", "");
      } else {
        block.element.removeAttribute("contenteditable");
        block.element.removeAttribute("data-bitplan-editable");
      }
    }
  }
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialized dispatcher keeps revision and local-draft guards at the private channel boundary
  port.addEventListener("message", (event) => {
    const data = read?.call(event);
    if (!data || typeof data !== "object") {
      return;
    }
    collect();
    if (data.type === "mode") {
      enabled = data.payload === true;
      mode();
    }
    if (data.type === "restore" && Array.isArray(data.payload)) {
      for (const value of data.payload.slice(0, 1000)) {
        if (!value || typeof value !== "object") {
          continue;
        }
        const block = blocks.get(value.path);
        if (
          !block ||
          value.original !== block.original ||
          typeof value.text !== "string" ||
          value.text.length > 64_000 ||
          !Number.isSafeInteger(value.revision) ||
          value.revision < 0
        ) {
          continue;
        }
        clearTimeout(block.timer);
        block.element.textContent = value.text;
        block.dirty = true;
        block.pending = false;
        block.conflict = true;
      }
    }
    if (data.type === "blocks" && Array.isArray(data.payload)) {
      for (const value of data.payload.slice(0, 1000)) {
        const block = blocks.get(value.path);
        if (
          !block ||
          value.original !== block.original ||
          typeof value.text !== "string" ||
          value.text.length > 16_000 ||
          !Number.isSafeInteger(value.revision) ||
          value.revision <= block.revision
        ) {
          continue;
        }
        if (block.dirty || block.pending) {
          block.remote = { revision: value.revision, text: value.text };
          continue;
        }
        block.text = value.text;
        block.revision = value.revision;
        block.element.textContent = value.text;
      }
    }
    if (data.type === "saved") {
      const value = data.payload;
      const block = blocks.get(value.path);
      if (!block?.pending) {
        return;
      }
      block.pending = false;
      block.text = value.text;
      block.revision = value.revision;
      block.dirty = block.element.textContent !== block.text;
      if (!block.dirty) {
        send("clean", { path: value.path, text: value.text });
      }
      if (
        !block.dirty &&
        block.remote &&
        block.remote.revision > block.revision
      ) {
        block.text = block.remote.text;
        block.revision = block.remote.revision;
        block.element.textContent = block.text;
      }
      save(value.path, block);
    }
    if (data.type === "failed") {
      const block = blocks.get(data.payload);
      if (block) {
        block.pending = false;
        block.conflict = true;
      }
    }
    if (data.type === "discard") {
      for (const block of blocks.values()) {
        block.pending = false;
        block.dirty = false;
        block.conflict = false;
        if (block.remote && block.remote.revision > block.revision) {
          block.text = block.remote.text;
          block.revision = block.remote.revision;
        }
        block.element.textContent = block.text;
      }
      send("discarded", {});
      send("ready", {});
    }
  });
  port.start();
  parent.postMessage({ type: "bitplan-text-ready/1" }, "*", [channel.port2]);
  document.addEventListener(
    "paste",
    (event) => {
      if (!enabled || trusted?.call(event) !== true) {
        return;
      }
      for (const block of blocks.values()) {
        if (
          event.target === block.element &&
          (block.element.textContent?.length ?? 0) +
            (event.clipboardData?.getData("text/plain").length ?? 0) >
            16_000
        ) {
          event.preventDefault();
          send(
            "error",
            "That paste is too large for one passage. Paste a smaller section (under 16,000 characters)."
          );
          return;
        }
      }
    },
    true
  );
  document.addEventListener(
    "input",
    (event) => {
      if (!enabled || trusted?.call(event) !== true) {
        return;
      }
      for (const [path, block] of blocks) {
        if (event.target !== block.element) {
          continue;
        }
        block.dirty = block.element.textContent !== block.text;
        send("draft", {
          original: block.original,
          path,
          revision: block.revision,
          text: block.element.textContent ?? "",
        });
        if (!(block.dirty || block.pending)) {
          send("clean", { path, text: block.element.textContent ?? "" });
        }
        clearTimeout(block.timer);
        block.timer = setTimeout(() => save(path, block), 700);
        break;
      }
    },
    true
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        !enabled ||
        trusted?.call(event) !== true ||
        event.isComposing ||
        event.key !== "Enter"
      ) {
        return;
      }
      for (const [path, block] of blocks) {
        if (event.target !== block.element) {
          continue;
        }
        event.preventDefault();
        save(path, block);
        block.element.blur();
        break;
      }
    },
    true
  );
  window.addEventListener("DOMContentLoaded", () => {
    collect();
    mode();
    const style = document.createElement("style");
    style.textContent =
      "[data-bitplan-editable]{cursor:text;outline-offset:5px}[data-bitplan-editable]:focus{outline:1px solid currentColor;border-radius:2px}";
    document.head.append(style);
    send("ready", {});
  });
}
