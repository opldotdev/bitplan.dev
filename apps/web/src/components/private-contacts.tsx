"use client";

import { ChevronDown, LockKeyhole } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { CommandCopy } from "@/components/command-copy";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type SelectedTeam, selectedTeams } from "@/lib/sharing";
import {
  connectBrowserWallet,
  getConnectedWalletClient,
  onWalletChange,
  reconnectAuthenticatedWallet,
} from "@/lib/wallet";
import {
  loadAddressBook,
  type PrivateAddressBook,
} from "../../../../packages/cli/src/address-book-sync";

/** Never send this state to a room, document, profile, or analytics. */
export function PrivateContacts({
  selected,
  onChange,
  teams = [],
  currentRecipients = [],
  actions,
  readOnly = false,
}: {
  selected: string[];
  onChange: (keys: string[], teams?: SelectedTeam[]) => void;
  teams?: SelectedTeam[];
  currentRecipients?: string[];
  actions?: ReactNode;
  readOnly?: boolean;
}) {
  const [book, setBook] = useState<PrivateAddressBook | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "missing" | "ready" | "error"
  >("idle");
  const [query, setQuery] = useState("");
  const prefix = useId();
  const generation = useRef(0);
  const mounted = useRef<boolean>(false);
  const load = useCallback(async () => {
    generation.current += 1;
    const { current } = generation;
    const wallet = getConnectedWalletClient();
    setBook(null);
    if (!wallet) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    try {
      const result = await loadAddressBook(wallet, window.location.origin);
      if (
        current !== generation.current ||
        wallet !== getConnectedWalletClient()
      ) {
        return;
      }
      setBook(result);
      setStatus(result ? "ready" : "missing");
    } catch {
      if (current === generation.current) {
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let wallet = getConnectedWalletClient();
    const unsubscribe = onWalletChange(() => {
      const next = getConnectedWalletClient();
      if (next === wallet) {
        return;
      }
      wallet = next;
      setQuery("");
      void load();
    });
    void load();
    // Link-based decryption does not adopt the user's already-authorized wallet.
    // Adoption notifies the subscription above; never prompt for authentication here.
    void reconnectAuthenticatedWallet();
    return () => {
      mounted.current = false;
      generation.current += 1;
      unsubscribe();
    };
  }, [load]);

  async function connectOrRefresh() {
    if (getConnectedWalletClient()) {
      await load();
      return;
    }
    setStatus("loading");
    const attempt = generation.current;
    try {
      // Adoption notifies the subscription above, which loads the contacts once.
      await connectBrowserWallet();
    } catch {
      if (mounted.current && attempt === generation.current) {
        setStatus("error");
      }
    }
  }

  function toggle(keys: string[], checked: boolean, name?: string) {
    const recipients = checked
      ? [...new Set([...selected, ...keys])]
      : selected.filter((key) => !keys.includes(key));
    const nextTeams =
      name && checked
        ? [
            ...teams.filter((team) => team.name !== name),
            { name, recipients: keys },
          ]
        : teams;
    onChange(recipients, selectedTeams(nextTeams, recipients));
  }

  if (readOnly) {
    return (
      <section aria-label="Current recipients" className="space-y-2">
        {selected.map((key) => {
          const name = Object.entries(book?.contacts ?? {}).find(
            ([, value]) => value === key
          )?.[0];
          return (
            <div className="flex items-center gap-3 text-sm" key={key}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs">
                {name ? (
                  name.slice(0, 2).toUpperCase()
                ) : (
                  <LockKeyhole className="size-3" />
                )}
              </span>
              <span className="min-w-0 truncate" title={key}>
                {name ?? `Unidentified · ${key.slice(0, 6)}…${key.slice(-4)}`}
              </span>
            </div>
          );
        })}
      </section>
    );
  }

  const idleLabel = getConnectedWalletClient() ? "Refresh" : "Connect wallet";
  return (
    <section
      aria-busy={status === "loading"}
      aria-label="Your private contacts"
      className="space-y-3"
      data-state={status}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          <LockKeyhole className="size-4" />
          Your contacts
        </span>
        <Button
          disabled={status === "loading"}
          onClick={connectOrRefresh}
          size="sm"
          variant="ghost"
        >
          {status === "loading" ? "Loading…" : idleLabel}
        </Button>
      </div>
      {status === "error" ? (
        <p className="text-destructive text-sm" role="alert">
          Could not unlock contacts. Check your wallet and try again.
        </p>
      ) : null}
      {status === "missing" ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            No synced contacts yet.
          </p>
          <CommandCopy command="bunx bitplan contacts sync --yes" />
          <p className="text-muted-foreground text-xs">
            Use this wallet in the CLI, then Refresh.
          </p>
        </div>
      ) : null}
      {book || selected.length || currentRecipients.length || actions ? (
        <>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Find a person or team"
              className="min-w-0 flex-1"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a person or team"
              value={query}
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  {teams.length
                    ? teams.map((team) => team.name).join(", ")
                    : "Teams"}{" "}
                  <ChevronDown className="size-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 gap-1 p-1">
                {Object.entries(book?.teams ?? {})
                  .filter(([name]) => name.includes(query.toLowerCase()))
                  .map(([name, members]) => {
                    const keys = members.flatMap((member) =>
                      book?.contacts[member] ? [book.contacts[member]] : []
                    );
                    const checked =
                      keys.length > 0 &&
                      keys.every((key) => selected.includes(key));
                    return (
                      <Button
                        aria-pressed={checked}
                        disabled={!keys.length}
                        key={name}
                        onClick={() => toggle(keys, !checked, name)}
                        size="sm"
                        variant={checked ? "secondary" : "outline"}
                      >
                        {name} · {members.length}
                      </Button>
                    );
                  })}
              </PopoverContent>
            </Popover>
            {actions}
          </div>
          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {[
              ...Object.entries(book?.contacts ?? {}),
              ...[...new Set([...currentRecipients, ...selected])]
                .filter(
                  (key) => !Object.values(book?.contacts ?? {}).includes(key)
                )
                .map((key): [string, string] => [
                  `${key.slice(0, 8)}…${key.slice(-6)}`,
                  key,
                ]),
            ]
              .sort(
                (a, b) =>
                  Number(selected.includes(b[1])) -
                  Number(selected.includes(a[1]))
              )
              .filter(
                ([name, key]) =>
                  name.includes(query.toLowerCase()) ||
                  key.includes(query.toLowerCase())
              )
              .map(([name, key]) => (
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
                  htmlFor={`${prefix}-${name}`}
                  key={name}
                >
                  <Checkbox
                    checked={selected.includes(key)}
                    id={`${prefix}-${name}`}
                    onCheckedChange={(checked) =>
                      toggle([key], checked === true)
                    }
                  />
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted font-medium text-sm"
                  >
                    {name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{name}</span>
                    <span
                      className="block font-mono text-muted-foreground text-xs"
                      title={key}
                    >
                      {key.slice(0, 10)}…{key.slice(-6)}
                    </span>
                  </span>
                  {currentRecipients.includes(key) ? (
                    <span
                      aria-label="Has current access"
                      className="ml-auto text-muted-foreground"
                      role="img"
                      title="Can open the current document"
                    >
                      <LockKeyhole className="size-3.5" />
                    </span>
                  ) : null}
                </label>
              ))}
            {Object.keys(book?.contacts ?? {}).length ||
            selected.length ||
            currentRecipients.length ? null : (
              <p className="text-muted-foreground text-sm">
                Your synced book is empty.
              </p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
