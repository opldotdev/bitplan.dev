import type { Metadata } from "next";
import Link from "next/link";

import { CommandCopy } from "@/components/command-copy";

export const metadata: Metadata = {
  description:
    "Reader links, wallet recipients, encrypted live rooms, and changing access to a BitPlan.",
  title: "Sharing and access",
};

export default function SharingPage() {
  return (
    <>
      <h1>Sharing and access</h1>
      <p>
        A hosted draft is already encrypted. You can share access through a
        secret link or encrypt a version for specific wallet identities. Neither
        requires putting the document on chain.
      </p>
      <h2>Two encrypted layers</h2>
      <div className="not-typeset grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-5">
          <h3 className="font-medium">Document</h3>
          <p className="mt-2 text-muted-foreground text-sm">
            Wallet or reader-link identity → unwrap document key → open this
            version
          </p>
        </div>
        <div className="rounded-lg border p-5">
          <h3 className="font-medium">Live room</h3>
          <p className="mt-2 text-muted-foreground text-sm">
            Room invitation → decrypt live edits, annotations, and presence
          </p>
        </div>
      </div>
      <p>
        These permissions are separate. Reading a document does not grant access
        to an existing room or permission to publish its next version.
      </p>
      <h2>What is in a guest link?</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>/d/h_ID</code>
              </td>
              <td>Locates the encrypted document. No decryption power.</td>
            </tr>
            <tr>
              <td>
                <code>#k=…</code>
              </td>
              <td>
                A throwaway reader private key that unwraps the document key.
              </td>
            </tr>
            <tr>
              <td>
                <code>room=…&amp;collab=…</code>
              </td>
              <td>
                Identifies a live room and supplies its separate secret
                invitation.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The reader key is neither your funding-wallet key nor the AES document
        key. “Ephemeral” means a throwaway identity; it does not mean the link
        expires. Anyone holding it can read versions encrypted for that
        identity.
      </p>
      <p>
        Browsers do not send URL fragments in HTTP requests, but page scripts
        can read them and copied links can leak them. Treat the complete
        invitation like a password. A reader-only link omits room access.
      </p>
      <h2>Invite a person or bot by identity</h2>
      <h3>Your private address book</h3>
      <p>
        The CLI can sync a snapshot of your contacts and teams, encrypted only
        for its connected wallet. In the Publish sidebar, the owner can choose
        Private copy and unlock contacts using that same identity. Your book is
        not included in the plan, its annotations, or its collaboration room.
      </p>
      <div className="not-typeset">
        <CommandCopy command="bunx bitplan contacts sync --yes" />
      </div>
      <p>
        Review your local contacts before syncing: this explicitly replaces that
        wallet’s previous hosted address book. It does not change the local book
        or grant anyone plan access. Different wallets have separate books, even
        on the same device. Sync requires a CLI build that includes
        <code> contacts sync</code>; check its help before running it.
      </p>
      <p>
        Select a team, then adjust individual recipients. Only selected public
        keys enter the sharing handoff; private contact labels and team names do
        not. Initials identify contacts without claiming a roster character or
        verified live presence. Contributors see the current recipients
        read-only; they cannot change the document's access. Direct creation of
        a private live copy is not wired yet: the sidebar still hands off to
        your agent and does not re-encrypt an existing room.
      </p>
      <p>
        Ask for their BRC-100 public identity key and verify it with them. Never
        request their private key. Contacts and teams are managed locally in the
        CLI; syncing them is optional. Adding a member does not change any
        encrypted version yet.
      </p>
      <div className="not-typeset space-y-2">
        <CommandCopy command="bunx bitplan contact set alice <public-identity-key>" />
        <CommandCopy command="bunx bitplan team add project alice" />
        <CommandCopy command="bunx bitplan upload ./plan.html --hosted --draft <draft-id> --share-with project" />
      </div>
      <p>
        Run updates from the CLI installation holding this draft&apos;s update
        secret. The next envelope wraps a fresh content key for its recipients.
        Their wallet needs the matching private identity to open it; knowing a
        public key is insufficient. Share the plain document URL and confirm
        they can open the new version with their wallet.
      </p>
      <p>
        “Self” means the publishing wallet, not every wallet on your device. Add
        your other wallet identities as recipients too. Team names stay in your
        private book; recipient public keys are visible in the envelope header.
      </p>
      <h2>Move away from link access</h2>
      <ol>
        <li>
          Review the current document and live annotations before preparing the
          next version. CLI fetch alone does not include the room.
        </li>
        <li>
          Remove the old link reader from the new version, then add the intended
          wallet recipients.
        </li>
        <li>
          Verify wallet decryption before distributing a URL without a key.
        </li>
      </ol>
      <p>
        For a CLI-managed draft, this currently takes two hosted versions: first{" "}
        <code>--private</code> removes all additional readers; then
        <code> --share-with</code> adds the team. These flags cannot be
        combined.
      </p>
      <div className="not-typeset space-y-2">
        <CommandCopy command="bunx bitplan upload ./plan.html --hosted --draft <draft-id> --private" />
        <CommandCopy command="bunx bitplan upload ./plan.html --hosted --draft <draft-id> --share-with project" />
      </div>
      <p>
        Review each confirmation. Simply omitting <code>--link</code> preserves
        inherited readers. Deleting <code>#k</code> from a URL changes no access
        rights. Old links can still decrypt old versions; re-encryption cannot
        revoke copies someone already has.
      </p>
      <h2>Where the transition stops today</h2>
      <p>
        Connecting a wallet does not re-encrypt a guest draft or its live room.
        Browser starters do not retain the hosted update secret needed for CLI
        replacement. Preserve their reviewed content in a new wallet-managed
        draft; there is no automatic in-place ownership conversion.
      </p>
      <p>
        Live rooms still use secret invitations, including when the document
        uses wallet recipients. Wallet-only room membership, invitation
        rotation, and verified participant identities are not implemented. A
        character or displayed public key is not proof of identity. Opening a
        document without its room invitation may create a different room.
      </p>
      <details>
        <summary>Encryption and publishing boundaries</summary>
        <p>
          Documents use AES-256-GCM with a separately wrapped key per reader.
          Rooms derive separate AES-GCM encryption and authorization keys from
          their invitation using HKDF-SHA-256. Convex receives the authorization
          proof and encrypted values, plus routing metadata, sizes, and timing.
        </p>
        <p>
          Reading rights do not confer publishing rights: hosted updates need
          the separate update secret; on-chain revisions need control of the
          current ordinal. Saving live edits does not create an inscription.
        </p>
      </details>
      <p>
        See <Link href="/docs/envelope">the envelope format</Link> or{" "}
        <Link href="/docs/agents">agent setup</Link>.
      </p>
    </>
  );
}
