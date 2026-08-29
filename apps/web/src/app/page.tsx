import { GitBranch, Lock, ShieldCheck } from "lucide-react";

import { CommandCopy } from "@/components/command-copy";

const features = [
  {
    body: "AES-256-GCM, key wrapped to your wallet. The chain stores ciphertext; bitplan.dev stores nothing.",
    icon: Lock,
    title: "Encrypted.",
  },
  {
    body: "Each revision respends the same satoshi with a new envelope. The origin outpoint is the draft's identity forever.",
    icon: GitBranch,
    title: "Versioned.",
  },
  {
    body: "Only the wallet holding the coin can publish the next version. The wallet is the account; the signature is the API key.",
    icon: ShieldCheck,
    title: "Yours.",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center px-6 py-10">
      <div className="space-y-10">
        <div className="space-y-3">
          <h1 className="font-semibold text-[2.5rem] leading-tight tracking-tight">
            Plan documents on Bitcoin.
          </h1>
          <p className="text-muted-foreground">
            Encrypted by default. Versioned by reinscription. No servers hold
            your content.
          </p>
        </div>

        <CommandCopy />

        <ul className="space-y-6">
          {features.map((feature) => (
            <li className="flex gap-4" key={feature.title}>
              <feature.icon
                aria-hidden
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              />
              <p>
                <span className="font-semibold">{feature.title} </span>
                {feature.body}
              </p>
            </li>
          ))}
        </ul>

        <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://www.npmjs.com/package/bitplan"
          >
            CLI on npm
          </a>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://github.com/opldotdev/bitplan.dev/blob/master/packages/cli/ENVELOPE.md"
          >
            Envelope spec
          </a>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://k57tkc9tukz5.postplan.dev"
          >
            How it compares to postplan
          </a>
        </p>
      </div>
    </main>
  );
}
