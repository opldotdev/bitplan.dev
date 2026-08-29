/**
 * Git provenance for the metadata block, following postplan's shape.
 *
 * Everything here is best-effort: outside a repository every field is null and
 * the upload proceeds. None of it is trusted for anything — it is a note to
 * the reader about where a draft came from, and it travels inside the
 * encrypted plaintext, not in the cleartext MAP.
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'

export interface GitMetadata {
	repoOrg: string | null
	repoName: string | null
	repoHost: string | null
	gitBranch: string | null
	gitCommitSha: string | null
	gitCommitSubject: string | null
	gitDirty: boolean | null
}

export function collectGitMetadata(cwd: string): GitMetadata {
	const repoRoot = git(['rev-parse', '--show-toplevel'], cwd)
	const remote = git(['config', '--get', 'remote.origin.url'], cwd)
	const parsedRemote = parseRemote(remote)
	const status = git(['status', '--porcelain'], cwd)

	return {
		repoOrg: parsedRemote.org ?? inferOrgFromRoot(repoRoot),
		repoName: parsedRemote.name ?? (repoRoot ? path.basename(repoRoot) : null),
		repoHost: parsedRemote.host ?? null,
		gitBranch: git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
		gitCommitSha: git(['rev-parse', 'HEAD'], cwd),
		gitCommitSubject: git(['log', '-1', '--format=%s'], cwd),
		// null when not a git repo; true/false when a working tree is present.
		gitDirty: status === null ? null : status.length > 0,
	}
}

function git(args: string[], cwd: string): string | null {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim()
	} catch {
		return null
	}
}

interface ParsedRemote {
	host?: string
	org?: string
	name?: string
}

export function parseRemote(remote: string | null): ParsedRemote {
	if (!remote) return {}

	const cleaned = remote.replace(/\.git$/, '')
	const sshMatch = cleaned.match(/^[^@]+@([^:]+):([^/]+)\/(.+)$/)
	if (sshMatch?.[1] && sshMatch[2] && sshMatch[3]) {
		return {
			host: sshMatch[1],
			org: sshMatch[2],
			name: path.basename(sshMatch[3]),
		}
	}

	try {
		const url = new URL(cleaned)
		const parts = url.pathname.split('/').filter(Boolean)
		if (parts.length >= 2) {
			return { host: url.hostname, org: parts[0], name: parts.at(-1) }
		}
	} catch {
		// Fall through to path parsing.
	}

	const parts = cleaned.split('/').filter(Boolean)
	if (parts.length >= 2) {
		return { org: parts.at(-2), name: parts.at(-1) }
	}

	return {}
}

function inferOrgFromRoot(repoRoot: string | null): string | null {
	if (!repoRoot) return null
	return path.basename(path.dirname(repoRoot))
}
