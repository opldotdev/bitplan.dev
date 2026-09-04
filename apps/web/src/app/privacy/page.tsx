import type { Metadata } from "next";

export const metadata: Metadata = {
  description:
    "BitPlan stores hosted drafts as ciphertext and never receives plan plaintext or wallet keys.",
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <div className="typeset">
        <h1>Privacy</h1>
        <p>
          BitPlan does not create accounts. A hosted draft is a sealed envelope
          stored as ciphertext. An on-chain plan is a 1Sat Ordinal inscription.
          This website never receives plan plaintext; an authorized wallet or
          reader link decrypts it in your browser.
        </p>
        <p>
          Wallet identity keys stay in your BRC-100 wallet. The CLI stores local
          file-to-origin maps under <code>~/.bitplan</code> on your machine, not
          on this site.
        </p>
        <p>
          Ordinary HTTP logs for this website are whatever the host records.
          1Sat indexes public chain data. We cannot un-publish an inscription
          and we cannot un-decrypt a version someone already holds. Shared
          envelopes name reader identity keys in the header; those keys are
          public on the chain. A reader link secret stays in your browser&apos;s
          address bar; bitplan.dev never receives it.
        </p>
        <p>
          Hosted drafts are ciphertext stored by bitplan.dev, with the reader
          list in the public envelope header. We can delete a hosted draft on a
          valid request. We cannot read them.
        </p>
      </div>
    </main>
  );
}
