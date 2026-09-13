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
    deleted: boolean;
    dirty: boolean;
    element: HTMLElement;
    marker?: Comment;
    original: string;
    pending: boolean;
    remote?: { text: string; revision: number; deleted?: boolean };
    revision: number;
    savedDeleted: boolean;
    text: string;
    timer?: ReturnType<typeof setTimeout>;
  }
  const blocks = new Map<string, Block>();
  let enabled = false;
  let selected: Block | null = null;
  let editing: Block | null = null;
  const byElement = new Map<EventTarget, Block>();
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
      const block: Block = {
        conflict: false,
        deleted: false,
        dirty: false,
        element,
        original: element.textContent,
        pending: false,
        revision: 0,
        savedDeleted: false,
        text: element.textContent,
      };
      blocks.set(`body>${parts.join(">")}`, block);
      byElement.set(element, block);
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
      deleted: block.deleted,
      original: block.original,
      path,
      revision: block.revision,
      text,
    });
  }
  function mode() {
    for (const block of blocks.values()) {
      if (enabled) {
        block.element.setAttribute("data-bitplan-editable", "");
      } else {
        block.element.removeAttribute("contenteditable");
        block.element.removeAttribute("data-bitplan-editable");
      }
    }
    if (!enabled) {
      clearSelection();
    }
  }
  function clearSelection() {
    if (editing) {
      editing.element.removeAttribute("contenteditable");
      editing.element.blur();
    }
    selected?.element.removeAttribute("data-bitplan-selected");
    selected = null;
    editing = null;
  }
  function render(block: Block, text: string, deleted = false) {
    block.element.textContent = text;
    block.deleted = deleted;
    if (deleted && !block.marker) {
      block.marker = document.createComment("bitplan text");
      block.element.replaceWith(block.marker);
      if (selected === block) {
        clearSelection();
      }
    } else if (!deleted && block.marker) {
      block.marker.replaceWith(block.element);
      block.marker = undefined;
    }
  }
  function reportDraft(path: string, block: Block) {
    block.dirty =
      block.element.textContent !== block.text ||
      block.deleted !== block.savedDeleted;
    send("draft", {
      deleted: block.deleted,
      original: block.original,
      path,
      revision: block.revision,
      text: block.element.textContent ?? "",
    });
    clearTimeout(block.timer);
    block.timer = setTimeout(() => save(path, block), 700);
  }
  function removeSelected() {
    for (const [path, block] of blocks) {
      if (block !== selected) {
        continue;
      }
      render(block, "", true);
      reportDraft(path, block);
      save(path, block);
      break;
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
    if (data.type === "clear-selection") {
      clearSelection();
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
        render(block, value.text, value.deleted === true);
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
          block.remote = {
            deleted: value.deleted === true,
            revision: value.revision,
            text: value.text,
          };
          continue;
        }
        block.text = value.text;
        block.savedDeleted = value.deleted === true;
        block.revision = value.revision;
        render(block, value.text, block.savedDeleted);
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
      block.savedDeleted = value.deleted === true;
      block.revision = value.revision;
      block.dirty =
        block.element.textContent !== block.text ||
        block.deleted !== block.savedDeleted;
      if (!block.dirty) {
        send("clean", {
          deleted: block.deleted,
          path: value.path,
          text: value.text,
        });
      }
      if (
        !block.dirty &&
        block.remote &&
        block.remote.revision > block.revision
      ) {
        block.text = block.remote.text;
        block.savedDeleted = block.remote.deleted === true;
        block.revision = block.remote.revision;
        render(block, block.text, block.savedDeleted);
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
          block.savedDeleted = block.remote.deleted === true;
          block.revision = block.remote.revision;
        }
        render(block, block.text, block.savedDeleted);
      }
      send("discarded", {});
      send("ready", {});
    }
  });
  port.start();
  parent.postMessage({ type: "bitplan-text-ready/1" }, "*", [channel.port2]);
  document.addEventListener(
    "click",
    (event) => {
      if (!enabled || event.defaultPrevented || trusted?.call(event) !== true) {
        return;
      }
      const block = event.target ? byElement.get(event.target) : undefined;
      if (block === editing) {
        return;
      }
      const again = block === selected;
      clearSelection();
      if (!block || block.deleted) {
        return;
      }
      selected = block;
      block.element.setAttribute("data-bitplan-selected", "");
      if (again || event.detail >= 2) {
        editing = block;
        block.element.setAttribute("contenteditable", "plaintext-only");
        block.element.focus();
      }
    },
    true
  );
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
        reportDraft(path, block);
        if (!(block.dirty || block.pending)) {
          send("clean", { path, text: block.element.textContent ?? "" });
        }
        break;
      }
    },
    true
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (!enabled || trusted?.call(event) !== true || event.isComposing) {
        return;
      }
      if (event.key === "Escape") {
        clearSelection();
        return;
      }
      if (
        !editing &&
        selected &&
        (event.key === "Delete" || event.key === "Backspace") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        if (
          event.target instanceof Element &&
          event.target.closest("input,textarea,select,[contenteditable]")
        ) {
          return;
        }
        event.preventDefault();
        removeSelected();
        return;
      }
      if (event.key !== "Enter") {
        return;
      }
      for (const [path, block] of blocks) {
        if (event.target !== block.element) {
          continue;
        }
        event.preventDefault();
        save(path, block);
        clearSelection();
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
      "[data-bitplan-editable]{cursor:default;outline-offset:5px}[data-bitplan-selected]{outline:1px solid currentColor;border-radius:2px}[data-bitplan-editable][contenteditable]{cursor:text}";
    document.head.append(style);
    send("ready", {});
  });
}
