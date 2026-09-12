import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { validateHtml } from '../src/htmlPolicy'

const html = readFileSync(
	new URL('../../../docs/templates/proposal.html', import.meta.url),
	'utf8',
)
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
	(match) => match[1]!,
)

describe('comprehensive proposal template', () => {
	test('passes the actual upload policy and keeps choices unselected', () => {
		expect(validateHtml(html).ok).toBe(true)
		expect(html).not.toMatch(/<input[^>]*\schecked(?:\s|=|>)/)
		expect(html).not.toContain('#k=')
		for (const script of scripts)
			expect(() => new Function(script)).not.toThrow()
		for (const id of [...html.matchAll(/type="radio"[^>]*id="([^"]+)"/g)].map(
			(match) => match[1],
		)) {
			expect(html).toContain(`#${id}:checked`)
		}
	})

	test('response retains notes and flags conflicting choices; denied copy selects full text', async () => {
		const handlers: Record<string, () => void> = {}
		let chosen: { value: string } | null = null
		let conflict = false
		let selected = false
		const note = { value: 'Keep existing data.\nTest recovery first.' }
		const out = { textContent: '', focus() {} }
		const status = { textContent: '' }
		const hint = { textContent: '' }
		const button = {
			hidden: true,
			focus() {},
			addEventListener(event: string, handler: () => void) {
				handlers[event] = handler
			},
		}
		const decision = {
			dataset: { q: 'Rollout scope' },
			querySelector(selector: string) {
				return selector === '.vp-note' ? note : chosen
			},
		}
		const root = {
			dataset: {
				proposalTitle: 'Staged rollout',
				proposalVersion: 'draft 1',
				proposalOrigin: 'unpublished',
			},
			querySelectorAll() {
				return [decision]
			},
			addEventListener(event: string, handler: () => void) {
				handlers[event] = handler
			},
			querySelector(selector: string) {
				const elements: Record<string, unknown> = {
					'.vp-output': out,
					'.vp-copy': button,
					'.vp-status': status,
					'.vp-copy-hint': hint,
				}
				return (
					elements[selector] ??
					(selector.endsWith(':checked') && conflict ? {} : null)
				)
			},
		}
		runInNewContext(scripts[0]!, {
			document: {
				querySelectorAll() {
					return [root]
				},
				createElement() {
					return { style: {}, select() {}, remove() {} }
				},
				body: { appendChild() {} },
				execCommand() {
					return false
				},
				createRange() {
					return {
						selectNodeContents() {
							selected = true
						},
					}
				},
			},
			navigator: {
				clipboard: {
					writeText() {
						return Promise.reject(new Error('denied'))
					},
				},
			},
			window: {
				getSelection() {
					return { removeAllRanges() {}, addRange() {} }
				},
			},
		})
		expect(button.hidden).toBe(false)
		expect(out.textContent).toContain('(no selection)')
		chosen = { value: 'Unsure — check coverage' }
		handlers.input!()
		expect(out.textContent).toContain(chosen.value)
		expect(out.textContent).toContain(note.value)
		chosen = { value: 'All users' }
		conflict = true
		handlers.change!()
		expect(out.textContent).not.toContain('Unsure — check coverage')
		expect(out.textContent).toContain('Conflict:')
		handlers.click!()
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(selected).toBe(true)
		expect(status.textContent).toContain('Clipboard unavailable')
		expect(out.textContent).toContain(note.value)
		expect(out.textContent).toContain('Staged rollout (draft 1)')
	})
})
