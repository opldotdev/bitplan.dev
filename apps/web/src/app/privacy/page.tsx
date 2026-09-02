import type { Metadata } from "next";

export const metadata: Metadata = {
  description:
    "BitPlan does not keep a drafts database. Encrypted plans live on Bitcoin.",
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <div className="typeset">
        <h1>Privacy</h1>
        <p>
          BitPlan does not create accounts and does not keep a drafts database.
          Encrypted plan documents are inscriptions on Bitcoin. This website
          fetches public ciphertext from 1Sat and renders it in your browser
          after your wallet decrypts it.
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
      </div>
    </main>
  );
}
