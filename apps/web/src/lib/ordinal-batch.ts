import {
  buildOrdinalCustomInstructions,
  buildSpendsForResolved,
  buildTransferOrdinals,
  type CompleteSignedActionResult,
  completeSignedAction,
  createContext,
  MAX_INSCRIPTION_BYTES,
  ORDINALS_BASKET,
  P1SAT_PROTOCOL,
  type ResolvedSpend,
  stampManagedOutputIds,
} from "@1sat/actions";
import { buildInscriptionScript } from "@1sat/templates";
import {
  Beef,
  type CreateActionArgs,
  type CreateActionResult,
  Hash,
  P2PKH,
  PublicKey,
  Transaction,
  Utils,
  type WalletInterface,
} from "@bsv/sdk";

const OUTPOINT = /^([0-9a-f]{64})[._](0|[1-9][0-9]*)$/i;
const CONTENT_TYPE = "application/x-bitplan";
const TYPE_TAG = `type:${CONTENT_TYPE}`;
const MAP = { app: "bitplan", enc: "1" };

export interface OrdinalBatchItem {
  /** Current wallet coin; origin is caller-supplied lineage, not a proof. */
  coin?: { id: string; outpoint: string; origin: string };
  /** Already encrypted. This layer never changes envelope bytes. */
  envelope: Uint8Array;
  kind?: "plan" | "annotation";
}
export interface PreparedOrdinalBatch {
  args: CreateActionArgs;
  createResult: CreateActionResult & {
    signableTransaction: { reference: string; tx: number[] };
  };
  origins: (string | null)[];
  sources: ResolvedSpend[];
}
export interface SignedOrdinalBatch {
  beef: Uint8Array;
  outputs: { origin: string; outpoint: string }[];
  txid: string;
}

export class OrdinalBatchError extends Error {
  readonly reference?: string;
  readonly abortConfirmed?: boolean;
  readonly signed?: { txid?: string; beef: Uint8Array };
  constructor(
    message: string,
    details: {
      reference?: string;
      abortConfirmed?: boolean;
      signed?: { txid?: string; beef: Uint8Array };
      cause?: unknown;
    } = {}
  ) {
    super(message, { cause: details.cause });
    this.name = "OrdinalBatchError";
    this.reference = details.reference;
    this.abortConfirmed = details.abortConfirmed;
    this.signed = details.signed;
  }
}

function canonicalOutpoint(value: string): string {
  const match = OUTPOINT.exec(value);
  const index = Number(match?.[2]);
  if (!(match && Number.isSafeInteger(index)) || index > 0xff_ff_ff_ff) {
    throw new Error("Invalid ordinal outpoint.");
  }
  return `${match[1]?.toLowerCase()}_${index}`;
}
function inputOutpoint(tx: Transaction, index: number): string {
  const input = tx.inputs[index];
  if (!input) {
    throw new Error("The wallet changed ordinal input order.");
  }
  const txid = input.sourceTXID ?? input.sourceTransaction?.id("hex");
  return canonicalOutpoint(`${txid}_${input.sourceOutputIndex}`);
}

/** Prefix placement preserves the first sat of each one-sat ordinal input. */
function validateLayout(
  tx: Transaction,
  prepared: Pick<PreparedOrdinalBatch, "args" | "sources">
) {
  for (const [index, expected] of (prepared.args.outputs ?? []).entries()) {
    const output = tx.outputs[index];
    if (
      output?.satoshis !== 1 ||
      expected.satoshis !== 1 ||
      output.lockingScript.toHex() !== expected.lockingScript
    ) {
      throw new Error(
        "The wallet changed requested ordinal output scripts or order."
      );
    }
  }
  for (const [index, source] of prepared.sources.entries()) {
    const input = tx.inputs[index];
    const parent = input?.sourceTransaction;
    const output = parent?.outputs[input.sourceOutputIndex];
    if (
      inputOutpoint(tx, index) !== canonicalOutpoint(source.outpoint) ||
      !parent ||
      parent.id("hex") !== canonicalOutpoint(source.outpoint).slice(0, 64) ||
      output?.satoshis !== 1
    ) {
      throw new Error(
        "Ordinal input prefix or one-satoshi source proof changed."
      );
    }
  }
}
function layout(tx: Transaction): string {
  return JSON.stringify({
    inputs: tx.inputs.map((input, index) => [
      inputOutpoint(tx, index),
      input.sequence,
    ]),
    lockTime: tx.lockTime,
    outputs: tx.outputs.map((output) => [
      output.satoshis,
      output.lockingScript.toHex(),
    ]),
    version: tx.version,
  });
}

/** Allocates an unsigned wallet action; caller must journal this before signing. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ordered wallet preparation validates every source and output before accepting a signable action
export async function prepareOrdinalBatch(
  wallet: WalletInterface,
  requestedItems: readonly OrdinalBatchItem[],
  actionLabel: string
): Promise<PreparedOrdinalBatch> {
  if (
    !actionLabel.trim() ||
    new TextEncoder().encode(actionLabel).length > 300
  ) {
    throw new Error("A stable action label of 1–300 bytes is required.");
  }
  const items = requestedItems.map((item) => ({
    ...item,
    envelope: item.envelope.slice(),
    ...(item.coin ? { coin: { ...item.coin } } : {}),
  }));
  if (!items.length || items.length > 32) {
    throw new Error("Choose between 1 and 32 ordinal outputs.");
  }
  let genesis = false;
  const ids = new Set<string>();
  const outpoints = new Set<string>();
  for (const item of items) {
    if (
      !item.envelope.byteLength ||
      item.envelope.byteLength > MAX_INSCRIPTION_BYTES
    ) {
      throw new Error("Envelope is empty or exceeds the inscription limit.");
    }
    if (!item.coin) {
      genesis = true;
      continue;
    }
    if (genesis) {
      throw new Error("Existing ordinals must precede new ordinals.");
    }
    const outpoint = canonicalOutpoint(item.coin.outpoint);
    canonicalOutpoint(item.coin.origin);
    if (!item.coin.id || ids.has(item.coin.id) || outpoints.has(outpoint)) {
      throw new Error("An ordinal cannot be spent twice in one batch.");
    }
    ids.add(item.coin.id);
    outpoints.add(outpoint);
  }
  const args: CreateActionArgs = {
    description: `Prepare ${items.length} BitPlan ordinal outputs`,
    inputs: [],
    labels: [actionLabel],
    options: {
      acceptDelayedBroadcast: false,
      noSend: true,
      randomizeOutputs: false,
      returnTXIDOnly: false,
      signAndProcess: false,
    },
    outputs: [],
  };
  const proofs = new Beef();
  const sources: ResolvedSpend[] = [];
  const origins: (string | null)[] = [];
  for (const { coin, envelope, kind } of items) {
    const map = { ...MAP, type: kind ?? "plan" };
    if (coin) {
      // biome-ignore lint/performance/noAwaitInLoops: preserve explicit wallet request order and avoid overlapping permission requests
      const transfer = await buildTransferOrdinals(
        createContext(wallet, { chain: "main" }),
        {
          transfers: [
            {
              counterparty: "self",
              id: coin.id,
              inscription: {
                base64Content: Utils.toBase64(Array.from(envelope)),
                contentType: CONTENT_TYPE,
              },
              map,
            },
          ],
        }
      );
      if ("error" in transfer) {
        throw new Error(transfer.error);
      }
      const [input] = transfer.inputs ?? [];
      const [output] = transfer.outputs ?? [];
      const [source] = transfer.sources;
      if (
        transfer.inputs?.length !== 1 ||
        transfer.outputs?.length !== 1 ||
        transfer.sources.length !== 1 ||
        !input ||
        canonicalOutpoint(input.outpoint) !==
          canonicalOutpoint(coin.outpoint) ||
        output?.satoshis !== 1 ||
        source?.satoshis !== 1 ||
        canonicalOutpoint(source.outpoint) !==
          canonicalOutpoint(coin.outpoint) ||
        !source.customInstructions ||
        !transfer.inputBEEF?.length
      ) {
        throw new Error(
          "Ordinal source changed or its proof/instructions are missing."
        );
      }
      args.inputs?.push(input);
      args.outputs?.push(output);
      proofs.mergeBeef(Array.from(transfer.inputBEEF));
      sources.push({
        customInstructions: source.customInstructions,
        outpoint: input.outpoint,
      });
      origins.push(canonicalOutpoint(coin.origin));
    } else {
      const keyID = `inscribe-${crypto.randomUUID()}`;
      const { publicKey } = await wallet.getPublicKey({
        counterparty: "self",
        forSelf: true,
        keyID,
        protocolID: P1SAT_PROTOCOL,
      });
      const tags = [
        TYPE_TAG,
        "origin",
        `sha256:${Utils.toHex(Hash.sha256(Array.from(envelope)))}`,
      ];
      args.outputs?.push({
        basket: ORDINALS_BASKET,
        customInstructions: buildOrdinalCustomInstructions({
          keyID,
          protocolID: P1SAT_PROTOCOL,
          tags,
        }),
        lockingScript: buildInscriptionScript(
          new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()),
          envelope,
          CONTENT_TYPE,
          map
        ).toHex(),
        outputDescription: "Encrypted BitPlan ordinal",
        satoshis: 1,
        tags,
      });
      origins.push(null);
    }
  }
  if (sources.length) {
    args.inputBEEF = proofs.toBinary();
  }
  stampManagedOutputIds(args);
  const result = await wallet.createAction(structuredClone(args));
  if (
    !(
      result.signableTransaction?.reference &&
      result.signableTransaction.tx?.length
    )
  ) {
    throw new OrdinalBatchError(
      "Wallet does not support unsigned no-send preparation. Review wallet activity before retrying.",
      {
        reference: result.signableTransaction?.reference,
        ...(result.tx
          ? { signed: { beef: Uint8Array.from(result.tx), txid: result.txid } }
          : {}),
      }
    );
  }
  const prepared: PreparedOrdinalBatch = {
    args,
    createResult: {
      ...result,
      signableTransaction: {
        reference: result.signableTransaction.reference,
        tx: Array.from(result.signableTransaction.tx),
      },
    },
    origins,
    sources,
  };
  try {
    validateLayout(
      Transaction.fromAtomicBEEF(prepared.createResult.signableTransaction.tx),
      prepared
    );
  } catch (cause) {
    const { reference } = prepared.createResult.signableTransaction;
    const aborted = await wallet.abortAction({ reference }).catch(() => null);
    throw new OrdinalBatchError(
      "Prepared ordinal layout is invalid. Reconcile this wallet action before retrying.",
      { abortConfirmed: aborted?.aborted === true, cause, reference }
    );
  }
  return prepared;
}

/** Signs but never relays. Caller journals these bytes before any network submission. */
export async function signOrdinalBatch(
  wallet: WalletInterface,
  prepared: PreparedOrdinalBatch
): Promise<SignedOrdinalBatch> {
  let result: CompleteSignedActionResult | undefined;
  try {
    const unsigned = Transaction.fromAtomicBEEF(
      prepared.createResult.signableTransaction.tx
    );
    validateLayout(unsigned, prepared);
    const expectedLayout = layout(unsigned);
    result = await completeSignedAction(
      wallet,
      prepared.createResult,
      prepared.args.inputBEEF ? Array.from(prepared.args.inputBEEF) : undefined,
      async (tx) => {
        validateLayout(tx, prepared);
        const spends = await buildSpendsForResolved(
          wallet,
          tx,
          prepared.sources
        );
        if ("error" in spends) {
          throw new Error(spends.error);
        }
        return spends;
      },
      { acceptDelayedBroadcast: false, noSend: true, returnTXIDOnly: false }
    );
    if (result.error || !result.txid || !result.tx?.length) {
      throw new Error(
        result.error ??
          "Wallet returned no signed AtomicBEEF. Do not relay or retry without reconciliation."
      );
    }
    const signed = Transaction.fromAtomicBEEF(result.tx);
    if (
      signed.id("hex") !== result.txid.toLowerCase() ||
      layout(signed) !== expectedLayout
    ) {
      throw new Error(
        "Signed transaction does not match the prepared ordinal batch."
      );
    }
    validateLayout(signed, prepared);
    const txid = signed.id("hex");
    return {
      beef: Uint8Array.from(result.tx),
      outputs: prepared.origins.map((origin, index) => ({
        origin: origin ?? `${txid}_${index}`,
        outpoint: `${txid}_${index}`,
      })),
      txid,
    };
  } catch (cause) {
    throw new OrdinalBatchError(
      "Signing did not return a validated no-send ordinal batch. Reconcile the existing wallet action before retrying.",
      {
        cause,
        reference: prepared.createResult.signableTransaction.reference,
        ...(result?.tx
          ? { signed: { beef: Uint8Array.from(result.tx), txid: result.txid } }
          : {}),
      }
    );
  }
}
