const DIAGRAM_CSS = `
  .sbox { fill: var(--card); stroke: var(--border); stroke-width: 1.5; }
  .sbox-acc {
    fill: color-mix(in oklab, var(--primary) 14%, var(--card));
    stroke: var(--primary);
    stroke-width: 1.5;
  }
  .sbox-dead {
    fill: var(--muted);
    stroke: var(--border);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }
  .stx {
    fill: var(--foreground);
    font: 600 12.5px var(--font-mono, ui-monospace, monospace);
  }
  .stx2 {
    fill: var(--muted-foreground);
    font: 11px var(--font-mono, ui-monospace, monospace);
  }
  .stx-acc {
    fill: var(--primary);
    font: 700 12.5px var(--font-mono, ui-monospace, monospace);
  }
  .sline { stroke: var(--muted-foreground); stroke-width: 1.5; fill: none; }
  .sline-acc { stroke: var(--primary); stroke-width: 2; fill: none; }
`;

function DiagramStyle() {
  return <style>{DIAGRAM_CSS}</style>;
}

export function ArchitectureDiagram() {
  return (
    <figure>
      <div className="not-typeset flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,5fr)_auto_minmax(0,8fr)] sm:items-center sm:gap-4">
        <TypicalArtifactDiagram />
        <p
          aria-hidden="true"
          className="text-center font-bold font-mono text-primary sm:hidden"
        >
          ↓
        </p>
        <p
          aria-hidden="true"
          className="hidden text-center font-bold font-mono text-primary sm:block"
        >
          →
        </p>
        <BitPlanStackDiagram />
      </div>
      <figcaption>
        Left: a typical hosted artifact stack. The operator of the API and the
        databases can read every draft. Right: BitPlan. The chain holds the
        bytes; this site only views them.
      </figcaption>
    </figure>
  );
}

function TypicalArtifactDiagram() {
  return (
    <svg
      aria-label="Typical artifact system: CLI talks to an API server, which writes Postgres and object storage. The operator can read everything."
      className="mx-auto h-auto w-full max-w-xs"
      role="img"
      viewBox="0 0 210 250"
    >
      <DiagramStyle />
      <text className="stx" textAnchor="middle" x="105" y="18">
        TYPICAL ARTIFACT
      </text>
      <text className="stx2" textAnchor="middle" x="105" y="32">
        SYSTEM
      </text>
      <rect className="sbox" height="34" rx="6" width="170" x="20" y="42" />
      <text className="stx" textAnchor="middle" x="105" y="63">
        upload CLI
      </text>
      <rect
        className="sbox-dead"
        height="40"
        rx="6"
        width="170"
        x="20"
        y="96"
      />
      <text className="stx" textAnchor="middle" x="105" y="113">
        API server
      </text>
      <text className="stx2" textAnchor="middle" x="105" y="127">
        api keys · rate limits
      </text>
      <rect
        className="sbox-dead"
        height="34"
        rx="6"
        width="80"
        x="20"
        y="156"
      />
      <text className="stx" textAnchor="middle" x="60" y="177">
        Postgres
      </text>
      <rect
        className="sbox-dead"
        height="34"
        rx="6"
        width="80"
        x="110"
        y="156"
      />
      <text className="stx" textAnchor="middle" x="150" y="177">
        S3
      </text>
      <rect
        className="sbox-dead"
        height="30"
        rx="6"
        width="170"
        x="20"
        y="210"
      />
      <text className="stx2" textAnchor="middle" x="105" y="229">
        operator reads everything
      </text>
      <line className="sline" x1="105" x2="105" y1="76" y2="96" />
      <line className="sline" x1="60" x2="60" y1="136" y2="156" />
      <line className="sline" x1="150" x2="150" y1="136" y2="156" />
    </svg>
  );
}

function BitPlanStackDiagram() {
  return (
    <svg
      aria-label="BitPlan: CLI and 1Sat wallet inscribe on a 1Sat Ordinal. Later versions are inscriptions on that same ordinal. OrdFS is the public read path. The bitplan.dev viewer decrypts in the browser."
      className="mx-auto h-auto w-full max-w-md"
      role="img"
      viewBox="0 0 360 250"
    >
      <DiagramStyle />
      <text className="stx-acc" textAnchor="middle" x="180" y="22">
        BITPLAN
      </text>
      <rect className="sbox-acc" height="40" rx="6" width="160" x="0" y="36" />
      <text className="stx" textAnchor="middle" x="80" y="53">
        bitplan CLI
      </text>
      <text className="stx2" textAnchor="middle" x="80" y="67">
        scan · encrypt · sign
      </text>
      <rect className="sbox" height="40" rx="6" width="160" x="200" y="36" />
      <text className="stx" textAnchor="middle" x="280" y="53">
        1Sat wallet
      </text>
      <text className="stx2" textAnchor="middle" x="280" y="67">
        keys + BRC-2 crypto
      </text>
      <rect className="sbox-acc" height="40" rx="6" width="360" x="0" y="110" />
      <text className="stx" textAnchor="middle" x="180" y="127">
        BSV chain: inscriptions, same ordinal
      </text>
      <text className="stx2" textAnchor="middle" x="180" y="141">
        v1 inscription → v2 reinscription → v3 …
      </text>
      <rect className="sbox" height="40" rx="6" width="160" x="0" y="176" />
      <text className="stx" textAnchor="middle" x="80" y="193">
        indexer / OrdFS
      </text>
      <text className="stx2" textAnchor="middle" x="80" y="207">
        public read path
      </text>
      <rect className="sbox" height="40" rx="6" width="160" x="200" y="176" />
      <text className="stx" textAnchor="middle" x="280" y="193">
        bitplan.dev viewer
      </text>
      <text className="stx2" textAnchor="middle" x="280" y="207">
        decrypts in the browser
      </text>
      <line className="sline" x1="160" x2="200" y1="56" y2="56" />
      <line className="sline-acc" x1="80" x2="80" y1="76" y2="110" />
      <line className="sline" x1="80" x2="80" y1="150" y2="176" />
      <line className="sline" x1="160" x2="200" y1="196" y2="196" />
    </svg>
  );
}

const VERSION_STEPS = [
  {
    accent: true,
    href: "/d/<origin>?v=1",
    lines: ["origin = txid₁_0 (draft ID forever)", "1 sat + ciphertext + MAP"],
    title: "v1 inscribe",
  },
  {
    accent: false,
    href: "/d/<origin>?v=2",
    lines: ["spends txid₁_0 → txid₂_0", "new envelope, same coin"],
    title: "v2 reinscribe",
  },
  {
    accent: false,
    href: "/d/<origin> = latest",
    lines: ["spends txid₂_0 → txid₃_0", "indexer tracks origin chain"],
    title: "v3 reinscribe",
  },
] as const;

export function ReinscriptionDiagram() {
  return (
    <figure>
      <div
        aria-label="Reinscription chain: version 1 inscribes the origin, versions 2 and 3 spend that same coin with a new envelope."
        className="not-typeset flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3"
        role="img"
      >
        {VERSION_STEPS.map((step, index) => (
          <div
            className="flex flex-1 flex-col gap-2 sm:contents"
            key={step.title}
          >
            {index > 0 ? (
              <>
                <p
                  aria-hidden="true"
                  className="text-center font-bold font-mono text-primary sm:hidden"
                >
                  ↓
                </p>
                <p
                  aria-hidden="true"
                  className="hidden self-center font-bold font-mono text-primary sm:block"
                >
                  →
                </p>
              </>
            ) : null}
            <div
              className={
                step.accent
                  ? "flex flex-1 flex-col rounded-lg border border-primary bg-primary/10 px-3 py-3 text-center"
                  : "flex flex-1 flex-col rounded-lg border bg-card px-3 py-3 text-center"
              }
            >
              <p className="font-mono font-semibold text-xs">{step.title}</p>
              {step.lines.map((line) => (
                <p
                  className="font-mono text-[11px] text-muted-foreground"
                  key={line}
                >
                  {line}
                </p>
              ))}
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                {step.href}
              </p>
            </div>
          </div>
        ))}
      </div>
      <figcaption>
        One satoshi, many inscriptions. The origin outpoint never changes. Each
        version is a spend of that coin with a new envelope.
      </figcaption>
    </figure>
  );
}
