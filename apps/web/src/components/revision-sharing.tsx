"use client";

import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { RevisionSharing } from "@/lib/plan-authority";
import { normalizeIdentityKey } from "@/lib/sharing";

const initial: RevisionSharing = { mode: "preserve", recipients: [] };
const Context = createContext<{
  currentAccess: { link: boolean; recipients: string[] };
  value: RevisionSharing;
  update: (value: RevisionSharing) => void;
  print: RefObject<((annotations: boolean) => Promise<void>) | null>;
} | null>(null);

/** Local next-revision intent only; never uploaded into collaboration state. */
export function RevisionSharingProvider({
  origin,
  currentAccess,
  children,
}: {
  origin: string;
  currentAccess: { link: boolean; recipients: string[] };
  children: ReactNode;
}) {
  const storageKey = `bitplan.revision-sharing.v1:${origin}`;
  const print = useRef<((annotations: boolean) => Promise<void>) | null>(null);
  const [value, setValue] = useState<RevisionSharing>(initial);
  useEffect(() => {
    setValue(initial);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (
        saved &&
        ["preserve", "link", "private"].includes(saved.mode) &&
        Array.isArray(saved.recipients) &&
        saved.recipients.length <= 1000 &&
        saved.recipients.every(
          (key: unknown) => typeof key === "string" && normalizeIdentityKey(key)
        )
      ) {
        setValue({
          mode: saved.mode,
          recipients: [...new Set<string>(saved.recipients)],
        });
      }
    } catch {
      /* Unavailable browser storage leaves a safe default. */
    }
  }, [storageKey]);
  function update(next: RevisionSharing) {
    setValue(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* In-memory sharing choices still work. */
    }
  }
  return (
    <Context.Provider value={{ currentAccess, print, update, value }}>
      {children}
    </Context.Provider>
  );
}

export const useRevisionSharing = () => useContext(Context);

export function RevisionRecipients({ recipients }: { recipients: string[] }) {
  return (
    <section
      aria-label="Selected recipients"
      className="max-h-24 space-y-1 overflow-auto text-xs"
    >
      <p>{recipients.length} selected · publishing wallet included</p>
      {recipients.map((key) => (
        <p className="font-mono" key={key} title={key}>
          {key.slice(0, 12)}…{key.slice(-8)}
        </p>
      ))}
    </section>
  );
}
