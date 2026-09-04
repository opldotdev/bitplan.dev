import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  BITPLAN_PROFILE,
  COMPETITORS,
  HUB_ROW_LABELS,
} from "@/lib/competitors";

export const metadata: Metadata = {
  description:
    "BitPlan compared with here.now, postplan, Claude Artifacts, and ChatGPT Sites. Who holds the content, who can read it, and what it costs.",
  title: "Compare",
};

function cell(slug: string, label: string): string {
  const competitor = COMPETITORS.find((item) => item.slug === slug);
  return competitor?.rows.find((row) => row.label === label)?.them ?? "";
}

function bitplanCell(label: string): string {
  return COMPETITORS[0]?.rows.find((row) => row.label === label)?.bitplan ?? "";
}

export default function ComparePage() {
  const latest = COMPETITORS.map((item) => item.checked)
    .sort()
    .at(-1);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <div className="typeset">
        <h1>Compare BitPlan</h1>
        <p>
          Every tool on this page turns something an agent wrote into a link a
          human can open. They differ on one question: who holds the bytes, and
          who can read them. BitPlan encrypts the plan in your wallet and can
          keep the ciphertext hosted while it changes or inscribe it on Bitcoin
          when it should be permanent. The other products host cleartext and
          decide access on their servers.
        </p>
        <p>
          The comparisons below try to be fair. Each product is better at
          something BitPlan does not do. Facts were checked on {latest}, and
          every page lists its sources.
        </p>

        <h2>At a glance</h2>
        <div className="typeset-scroll">
          <table>
            <thead>
              <tr>
                <th />
                <th>BitPlan</th>
                {COMPETITORS.map((competitor) => (
                  <th key={competitor.slug}>
                    <Link href={`/compare/${competitor.slug}`}>
                      {competitor.short}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HUB_ROW_LABELS.map((label) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td>{bitplanCell(label)}</td>
                  {COMPETITORS.map((competitor) => (
                    <td key={competitor.slug}>
                      {cell(competitor.slug, label)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Head to head</h2>
        <ul>
          {COMPETITORS.map((competitor) => (
            <li key={competitor.slug}>
              <Link href={`/compare/${competitor.slug}`}>
                BitPlan vs {competitor.name}
              </Link>
              . {competitor.oneLine}
            </li>
          ))}
        </ul>

        <h2>Where BitPlan is strong</h2>
        <ul>
          {BITPLAN_PROFILE.strengths.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2>Where BitPlan is weak</h2>
        <ul>
          {BITPLAN_PROFILE.weaknesses.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2>How to read this page</h2>
        <p>
          If a plan can be public, use whichever tool is closest to hand. If a
          plan should stay between you, your agent, and a few named readers, the
          cheapest honest option is to encrypt it before it leaves your machine.
          That is the only thing BitPlan does.
        </p>
        <div className="not-typeset mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/docs/how-it-works">How BitPlan works</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/cli-setup">CLI setup</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
