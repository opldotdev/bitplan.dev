const DIAGRAM_CSS = `
  .sbox { fill: var(--card); stroke: var(--border); stroke-width: 1.5; }
  .sbox-acc {
    fill: color-mix(in oklab, var(--primary) 14%, var(--card));
    stroke: var(--primary);
    stroke-width: 1.5;
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
      <div className="not-typeset mx-auto max-w-xl">
        <BitPlanStackDiagram />
      </div>
      <figcaption className="sr-only">
        The CLI validates and packages the draft. The wallet performs identity
        key operations and publishes. In the browser, the wallet unwraps the
        document key; the SDK opens the payload.
      </figcaption>
    </figure>
  );
}

function EncryptionStep({
  children,
  detail,
}: {
  children: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-center">
      <p className="font-mono font-semibold text-xs">{children}</p>
      {detail ? (
        <p className="font-mono text-[11px] text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

function DownArrow() {
  return (
    <p aria-hidden="true" className="my-1 text-center font-mono text-primary">
      ↓
    </p>
  );
}

export function EncryptionDiagram() {
  return (
    <figure>
      <div
        aria-label="The plan is encrypted once with a fresh document key. The wallet encrypts that key for the publisher and every named reader. The result is a BPLN envelope on-chain."
        className="not-typeset mx-auto max-w-sm"
        role="img"
      >
        <div className="rounded-lg border bg-card p-3">
          <EncryptionStep detail="fresh random 32-byte document key">
            Plan JSON
          </EncryptionStep>
          <DownArrow />
          <EncryptionStep detail="one authenticated ciphertext">
            SDK AES-256-GCM
          </EncryptionStep>
          <DownArrow />
          <EncryptionStep detail={'[2, "bitplan"] · keyID · self or reader'}>
            wallet.encrypt
          </EncryptionStep>
          <DownArrow />
          <EncryptionStep detail="document ciphertext + one wrapped key per reader">
            BPLN 0x02
          </EncryptionStep>
        </div>
      </div>
      <figcaption className="sr-only">
        The envelope is a container around the encrypted data. It is not an
        encryption algorithm.
      </figcaption>
    </figure>
  );
}

function BitPlanStackDiagram() {
  return (
    <svg
      aria-label="BitPlan publish path: the CLI validates and encrypts the payload with the SDK, then asks the BRC-100 wallet to wrap reader keys, sign, and publish to the BSV chain. Read path: OrdFS returns ciphertext to bitplan.dev, which asks the wallet to unwrap the document key and decrypts the payload in the browser."
      className="mx-auto h-auto w-full max-w-xl"
      role="img"
      viewBox="0 0 480 280"
    >
      <DiagramStyle />
      <defs>
        <marker
          id="bitplan-arrow"
          markerHeight="8"
          markerWidth="8"
          orient="auto-start-reverse"
          refX="7"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--muted-foreground)" />
        </marker>
        <marker
          id="bitplan-arrow-primary"
          markerHeight="8"
          markerWidth="8"
          orient="auto-start-reverse"
          refX="7"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--primary)" />
        </marker>
      </defs>
      <text className="stx-acc" textAnchor="middle" x="210" y="22">
        BITPLAN
      </text>
      <text className="stx2" textAnchor="middle" x="210" y="35">
        PUBLISH
      </text>
      <rect className="sbox" height="40" rx="6" width="170" x="0" y="46" />
      <text className="stx" textAnchor="middle" x="85" y="63">
        bitplan CLI
      </text>
      <text className="stx2" textAnchor="middle" x="85" y="77">
        validate · scan · envelope
      </text>
      <rect
        className="sbox-acc"
        height="40"
        rx="6"
        width="170"
        x="250"
        y="46"
      />
      <text className="stx" textAnchor="middle" x="335" y="63">
        BRC-100 wallet
      </text>
      <text className="stx2" textAnchor="middle" x="335" y="77">
        encrypt/wrap · sign · unwrap
      </text>
      <text className="stx2" textAnchor="middle" x="210" y="57">
        BRC-100
      </text>
      <rect
        className="sbox-acc"
        height="40"
        rx="6"
        width="170"
        x="125"
        y="126"
      />
      <text className="stx" textAnchor="middle" x="210" y="143">
        BSV chain
      </text>
      <text className="stx2" textAnchor="middle" x="210" y="157">
        encrypted 1Sat Ordinal
      </text>
      <text className="stx2" textAnchor="middle" x="210" y="192">
        READ + DECRYPT
      </text>
      <rect className="sbox" height="40" rx="6" width="170" x="0" y="216" />
      <text className="stx" textAnchor="middle" x="85" y="233">
        indexer / OrdFS
      </text>
      <text className="stx2" textAnchor="middle" x="85" y="247">
        returns ciphertext
      </text>
      <rect className="sbox" height="40" rx="6" width="170" x="250" y="216" />
      <text className="stx" textAnchor="middle" x="335" y="233">
        bitplan.dev viewer
      </text>
      <text className="stx2" textAnchor="middle" x="335" y="247">
        renders browser plaintext
      </text>
      <line
        className="sline-acc"
        markerEnd="url(#bitplan-arrow-primary)"
        x1="170"
        x2="250"
        y1="66"
        y2="66"
      />
      <line
        className="sline-acc"
        markerEnd="url(#bitplan-arrow-primary)"
        x1="302"
        x2="252"
        y1="86"
        y2="126"
      />
      <text className="stx2" textAnchor="middle" x="309" y="112">
        publish
      </text>
      <line
        className="sline"
        markerEnd="url(#bitplan-arrow)"
        x1="168"
        x2="117"
        y1="166"
        y2="216"
      />
      <line
        className="sline"
        markerEnd="url(#bitplan-arrow)"
        x1="170"
        x2="250"
        y1="236"
        y2="236"
      />
      <path
        className="sline-acc"
        d="M 420 236 H 455 V 66 H 420"
        markerEnd="url(#bitplan-arrow-primary)"
        markerStart="url(#bitplan-arrow-primary)"
      />
      <text
        className="stx2"
        textAnchor="middle"
        transform="rotate(-90 444 151)"
        x="444"
        y="151"
      >
        wallet.decrypt ↕ plaintext / key
      </text>
    </svg>
  );
}

const VERSION_STEPS = [
  {
    accent: true,
    href: "/d/<origin>?v=1",
    lines: [
      "origin = txid₁_vout (stable draft ID)",
      "1-sat output + envelope + MAP",
    ],
    title: "v1 inscribe",
  },
  {
    accent: false,
    href: "/d/<origin>?v=2",
    lines: ["spends current 1-sat output", "new outpoint; origin unchanged"],
    title: "v2 reinscribe",
  },
  {
    accent: false,
    href: "/d/<origin> = latest",
    lines: ["spends current 1-sat output", "indexer follows origin chain"],
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
      <figcaption className="sr-only">
        The first transaction creates the draft coin. Each later version spends
        its current output and creates a replacement carrying a new envelope;
        the origin outpoint remains the draft ID.
      </figcaption>
    </figure>
  );
}
