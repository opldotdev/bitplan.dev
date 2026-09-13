import { expect, test } from "bun:test";
import { P1SAT_PROTOCOL } from "@1sat/actions";
import { buildInscriptionScript } from "@1sat/templates";
import {
  Beef,
  type CreateActionArgs,
  LockingScript,
  P2PKH,
  PrivateKey,
  ProtoWallet,
  PublicKey,
  type SignActionArgs,
  Transaction,
  UnlockingScript,
  type WalletInterface,
  type WalletOutput,
} from "@bsv/sdk";
import {
  OrdinalBatchError,
  prepareOrdinalBatch,
  signOrdinalBatch,
} from "./ordinal-batch";

const envelope = Uint8Array.from([66, 80, 76, 78, 2, 4, 1]);
async function fakeWallet() {
  // Deterministic test-only cryptography; no live wallet/transport is used.
  const cryptoWallet = new ProtoWallet(new PrivateKey(123));
  const keyID = "test source";
  const { publicKey } = await cryptoWallet.getPublicKey({
    counterparty: "self",
    forSelf: true,
    keyID,
    protocolID: P1SAT_PROTOCOL,
  });
  const source = new Transaction();
  source.addOutput({
    lockingScript: LockingScript.fromHex(
      buildInscriptionScript(
        new P2PKH().lock(PublicKey.fromString(publicKey).toAddress()),
        envelope,
        "application/x-bitplan"
      ).toHex()
    ),
    satoshis: 1,
  });
  const origin = `${source.id("hex")}_0`;
  const output: WalletOutput = {
    customInstructions: JSON.stringify({
      counterparty: "self",
      keyID,
      protocolID: P1SAT_PROTOCOL,
    }),
    outpoint: `${source.id("hex")}.0`,
    satoshis: 1,
    spendable: true,
    tags: ["id:source", "type:application/x-bitplan", `origin:${origin}`],
  };
  const sourceProof = new Beef();
  sourceProof.mergeTransaction(source);
  const funding = new Transaction();
  funding.addOutput({
    lockingScript: LockingScript.fromASM("OP_TRUE"),
    satoshis: 10_000,
  });
  let unsigned: Transaction;
  const calls: {
    create?: CreateActionArgs;
    sign?: SignActionArgs;
    aborted: boolean;
  } = { aborted: false };
  const controls: {
    abortFails: boolean;
    fundingFirst: boolean;
    reverseOutputs: boolean;
    sourceSatoshis: number;
    txidOnly: boolean;
    wrongFinalOutput: boolean;
    wrongTxid: boolean;
    partialProof: boolean;
  } = {
    abortFails: false,
    fundingFirst: false,
    partialProof: false,
    reverseOutputs: false,
    sourceSatoshis: 1,
    txidOnly: false,
    wrongFinalOutput: false,
    wrongTxid: false,
  };
  const responseBeef = () => {
    if (!controls.partialProof) {
      return unsigned.toAtomicBEEF();
    }
    const partial = new Beef();
    partial.mergeTxidOnly(source.id("hex"));
    partial.mergeTransaction(funding);
    partial.mergeRawTx(unsigned.toBinary());
    return partial.toBinaryAtomic(unsigned.id("hex"));
  };
  const wallet = {
    abortAction: () => {
      calls.aborted = true;
      if (controls.abortFails) {
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve({ aborted: true });
    },
    createAction: (args: CreateActionArgs) => {
      calls.create = structuredClone(args);
      unsigned = new Transaction();
      if (controls.fundingFirst) {
        unsigned.addInput({ sourceOutputIndex: 0, sourceTransaction: funding });
      }
      for (const _input of args.inputs ?? []) {
        unsigned.addInput({ sourceOutputIndex: 0, sourceTransaction: source });
      }
      if (!controls.fundingFirst) {
        unsigned.addInput({ sourceOutputIndex: 0, sourceTransaction: funding });
      }
      const outputs = controls.reverseOutputs
        ? [...(args.outputs ?? [])].reverse()
        : (args.outputs ?? []);
      for (const item of outputs) {
        unsigned.addOutput({
          lockingScript: LockingScript.fromHex(item.lockingScript),
          satoshis: item.satoshis,
        });
      }
      unsigned.addOutput({
        lockingScript: LockingScript.fromASM("OP_TRUE"),
        satoshis: 9000,
      });
      for (const input of unsigned.inputs) {
        input.unlockingScript = UnlockingScript.fromASM("");
      }
      return Promise.resolve({
        signableTransaction: {
          reference: "dGVzdC1yZWZlcmVuY2U=",
          tx: responseBeef(),
        },
      });
    },
    createSignature: (
      args: Parameters<WalletInterface["createSignature"]>[0]
    ) => cryptoWallet.createSignature(args),
    getPublicKey: (args: Parameters<WalletInterface["getPublicKey"]>[0]) =>
      cryptoWallet.getPublicKey(args),
    listOutputs: async () => ({
      BEEF: sourceProof.toBinary(),
      outputs: [{ ...output, satoshis: controls.sourceSatoshis }],
      totalOutputs: 1,
    }),
    signAction: (args: SignActionArgs) => {
      calls.sign = args;
      for (const [index, spend] of Object.entries(args.spends)) {
        const input = unsigned.inputs[Number(index)];
        if (!input) {
          throw new Error("Missing test input");
        }
        input.unlockingScript = UnlockingScript.fromHex(spend.unlockingScript);
      }
      for (const input of unsigned.inputs) {
        input.unlockingScript ??= UnlockingScript.fromASM("");
      }
      if (controls.wrongFinalOutput && unsigned.outputs[0]) {
        unsigned.outputs[0].satoshis = 2;
      }
      return Promise.resolve({
        txid: controls.wrongTxid ? "a".repeat(64) : unsigned.id("hex"),
        ...(controls.txidOnly ? {} : { tx: responseBeef() }),
      });
    },
  } as unknown as WalletInterface;
  return {
    calls,
    coin: { id: "source", origin, outpoint: origin },
    controls,
    wallet,
  };
}

test("partial wallet proofs merge supplied sources before preparation, signing, and receipt validation", async () => {
  const f = await fakeWallet();
  f.controls.partialProof = true;
  const prepared = await prepareOrdinalBatch(
    f.wallet,
    [{ coin: f.coin, envelope }],
    "bitplan-checkpoint:partial"
  );
  expect(f.calls.aborted).toBe(false);
  const partial = Beef.fromBinary(prepared.createResult.signableTransaction.tx);
  expect(partial.findTxid(f.coin.origin.slice(0, 64))?.isTxidOnly).toBe(true);
  const signed = await signOrdinalBatch(f.wallet, prepared);
  const tx = Transaction.fromAtomicBEEF(Array.from(signed.beef));
  expect(tx.id("hex")).toBe(signed.txid);
  expect(tx.inputs[0]?.sourceTransaction?.id("hex")).toBe(
    f.coin.origin.slice(0, 64)
  );
  expect(tx.inputs[0]?.sourceTransaction?.outputs[0]?.satoshis).toBe(1);
  const withoutProof = {
    ...prepared,
    args: { ...prepared.args, inputBEEF: undefined },
  };
  await expect(signOrdinalBatch(f.wallet, withoutProof)).rejects.toThrow(
    OrdinalBatchError
  );
  const unrelated = new Beef();
  unrelated.mergeTransaction(new Transaction());
  await expect(
    signOrdinalBatch(f.wallet, {
      ...prepared,
      args: { ...prepared.args, inputBEEF: unrelated.toBinary() },
    })
  ).rejects.toThrow(OrdinalBatchError);
  await expect(
    signOrdinalBatch(f.wallet, {
      ...prepared,
      args: { ...prepared.args, inputBEEF: [0, 1, 2] },
    })
  ).rejects.toThrow(OrdinalBatchError);
});

test("mixed ordinal batch prepares, signs no-send, validates AtomicBEEF receipts and unchanged envelopes", async () => {
  const f = await fakeWallet();
  const prepared = await prepareOrdinalBatch(
    f.wallet,
    [
      { coin: f.coin, envelope },
      { envelope: Uint8Array.from([...envelope, 8]), kind: "annotation" },
    ],
    "bitplan-checkpoint:test"
  );
  expect(f.calls.sign).toBeUndefined();
  expect(f.calls.create?.options).toMatchObject({
    noSend: true,
    randomizeOutputs: false,
    returnTXIDOnly: false,
    signAndProcess: false,
  });
  expect(f.calls.create?.labels).toContain("bitplan-checkpoint:test");
  const signed = await signOrdinalBatch(
    f.wallet,
    JSON.parse(JSON.stringify(prepared))
  );
  expect(f.calls.sign?.options).toEqual({
    acceptDelayedBroadcast: false,
    noSend: true,
    returnTXIDOnly: false,
  });
  expect(signed.txid).toBe(
    Transaction.fromAtomicBEEF(Array.from(signed.beef)).id("hex")
  );
  expect(signed.outputs).toEqual([
    { origin: f.coin.origin, outpoint: `${signed.txid}_0` },
    { origin: `${signed.txid}_1`, outpoint: `${signed.txid}_1` },
  ]);
  expect(f.calls.create?.outputs?.[0]?.lockingScript).toContain(
    Buffer.from(envelope).toString("hex")
  );
  expect(f.calls.create?.outputs?.[1]?.lockingScript).toContain(
    Buffer.from("annotation").toString("hex")
  );
});

test("new outputs only still use explicit no-send signing", async () => {
  const f = await fakeWallet();
  const prepared = await prepareOrdinalBatch(
    f.wallet,
    [{ envelope }, { envelope: Uint8Array.from([...envelope, 8]) }],
    "bitplan-checkpoint:new"
  );
  const signed = await signOrdinalBatch(f.wallet, prepared);
  expect(Object.keys(f.calls.sign?.spends ?? {})).toHaveLength(0);
  expect(signed.outputs[1]?.origin).toBe(`${signed.txid}_1`);
});

test("reject reordered output/input prefix and bad source amounts before signing", async () => {
  for (const mode of [
    "reverseOutputs",
    "fundingFirst",
    "sourceSatoshis",
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: isolated wallet fault cases run sequentially for deterministic assertions
    const f = await fakeWallet();
    if (mode === "sourceSatoshis") {
      f.controls.sourceSatoshis = 2;
    } else {
      f.controls[mode] = true;
    }
    await expect(
      prepareOrdinalBatch(
        f.wallet,
        [
          { coin: f.coin, envelope },
          { envelope: Uint8Array.from([...envelope, 8]) },
        ],
        "bitplan-checkpoint:bad"
      )
    ).rejects.toThrow();
    expect(f.calls.sign).toBeUndefined();
  }
});

test("preserve reconciliation reference on abort failure and reject incomplete or altered signed results", async () => {
  const invalid = await fakeWallet();
  invalid.controls.reverseOutputs = true;
  invalid.controls.abortFails = true;
  try {
    await prepareOrdinalBatch(
      invalid.wallet,
      [{ envelope }, { envelope: Uint8Array.from([...envelope, 8]) }],
      "bitplan-checkpoint:abort"
    );
    throw new Error("Expected preparation rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(OrdinalBatchError);
    expect((error as OrdinalBatchError).reference).toBe("dGVzdC1yZWZlcmVuY2U=");
    expect((error as OrdinalBatchError).abortConfirmed).toBe(false);
  }
  for (const mode of ["txidOnly", "wrongTxid", "wrongFinalOutput"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: isolated wallet fault cases run sequentially for deterministic assertions
    const f = await fakeWallet();
    f.controls[mode] = true;
    const prepared = await prepareOrdinalBatch(
      f.wallet,
      [{ envelope }],
      "bitplan-checkpoint:final"
    );
    await expect(signOrdinalBatch(f.wallet, prepared)).rejects.toBeInstanceOf(
      OrdinalBatchError
    );
    expect(f.calls.sign?.options?.noSend).toBe(true);
  }
});
