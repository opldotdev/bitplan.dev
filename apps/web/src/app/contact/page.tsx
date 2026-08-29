import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "BitPlan source and issues live on GitHub.",
  title: "Contact",
};

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-[42rem] flex-1 px-6 py-10">
      <div className="typeset">
        <h1>Contact</h1>
        <p>
          BitPlan is open source. File issues and read the code at{" "}
          <a href="https://github.com/opldotdev/bitplan.dev">
            github.com/opldotdev/bitplan.dev
          </a>
          .
        </p>
        <p>
          The CLI is{" "}
          <a href="https://www.npmjs.com/package/bitplan">bitplan on npm</a>.
          There is no support inbox and no account system. If the wallet cannot
          decrypt a draft, the wallet that published it is the one that can.
        </p>
      </div>
    </main>
  );
}
