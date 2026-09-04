import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { COMPETITORS, findCompetitor } from "@/lib/competitors";

const PROTOCOL_PREFIX = /^https?:\/\//;

interface ComparePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return COMPETITORS.map((competitor) => ({ slug: competitor.slug }));
}

export async function generateMetadata({
  params,
}: ComparePageProps): Promise<Metadata> {
  const { slug } = await params;
  const competitor = findCompetitor(slug);
  if (!competitor) {
    return { title: "Compare" };
  }
  return {
    description: competitor.oneLine,
    title: `BitPlan vs ${competitor.name}`,
  };
}

export default async function CompareCompetitorPage({
  params,
}: ComparePageProps) {
  const { slug } = await params;
  const competitor = findCompetitor(slug);
  if (!competitor) {
    notFound();
  }

  const others = COMPETITORS.filter((item) => item.slug !== competitor.slug);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <div className="typeset">
        <p>
          <Link href="/compare">All comparisons</Link>
        </p>
        <h1>BitPlan vs {competitor.name}</h1>
        <p>
          <strong>Short version.</strong> {competitor.tldr}
        </p>

        <h2>What {competitor.name} is</h2>
        <p>
          {competitor.what} Site:{" "}
          <a href={competitor.url} rel="noreferrer">
            {competitor.url.replace(PROTOCOL_PREFIX, "")}
          </a>
          .
        </p>

        <h2>What BitPlan is</h2>
        <p>
          BitPlan is a CLI and a viewer. The CLI asks a BRC-100 wallet on your
          machine to encrypt a self-contained HTML plan. You can keep the
          ciphertext hosted while the plan changes, then publish it as a 1Sat
          Ordinal when it should be permanent. The viewer decrypts in the
          browser with an authorized wallet or reader link. There is no BitPlan
          account and the server never receives plaintext.
        </p>

        <h2>Side by side</h2>
        <div className="typeset-scroll">
          <table>
            <thead>
              <tr>
                <th />
                <th>BitPlan</th>
                <th>{competitor.name}</th>
              </tr>
            </thead>
            <tbody>
              {competitor.rows.map((row) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  <td>{row.bitplan}</td>
                  <td>{row.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Choose {competitor.name} if</h2>
        <ul>
          {competitor.chooseThem.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2>Choose BitPlan if</h2>
        <ul>
          {competitor.chooseBitplan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2>Where BitPlan falls short</h2>
        <ul>
          {competitor.bitplanLimits.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2>Moving a plan to BitPlan</h2>
        <p>
          BitPlan takes the same self-contained HTML file these tools do. Save
          the page, then run <code>bunx bitplan auth</code> once and{" "}
          <code>bunx bitplan upload ./plan.html --hosted --link</code>. External
          scripts and forms are rejected at upload, and the viewer runs inline
          scripts with no network access, so pages that call out to an API need
          a static pass first. Documents over 5 MB need to be split.
        </p>

        <h2>Sources</h2>
        <ul>
          {competitor.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="noreferrer">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">
          Checked {competitor.checked}. Prices and limits change. If something
          here is wrong,{" "}
          <a href="https://github.com/opldotdev/bitplan.dev/issues">
            open an issue
          </a>
          .
        </p>

        <h2>Other comparisons</h2>
        <ul>
          {others.map((item) => (
            <li key={item.slug}>
              <Link href={`/compare/${item.slug}`}>BitPlan vs {item.name}</Link>
            </li>
          ))}
        </ul>

        <div className="not-typeset mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/docs/cli-setup">Try BitPlan</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/how-it-works">How it works</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
