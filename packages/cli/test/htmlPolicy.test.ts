import { describe, expect, test } from 'bun:test'
import { DEFAULT_MAX_BYTES, validateHtml } from '../src/htmlPolicy.js'

const OK_DOC =
	'<!doctype html><html><head><title>Plan</title></head><body><h1>Hi</h1></body></html>'

describe('html policy — accepts', () => {
	test('a plain self-contained document', () => {
		const result = validateHtml(OK_DOC)
		expect(result.ok).toBe(true)
		expect(result.errors).toEqual([])
		expect(result.title).toBe('Plan')
		expect(result.hasScripts).toBe(false)
	})

	test('an inline script with no src', () => {
		const result = validateHtml(
			`<title>t</title><script>console.log(1)</script>`,
		)
		expect(result.ok).toBe(true)
		expect(result.hasScripts).toBe(true)
		expect(result.stats.hasInlineScript).toBe(true)
	})

	test('a data: image and records external image hosts', () => {
		const result = validateHtml(
			`<title>t</title><img src="data:image/png;base64,AAAA"><img src="https://Example.com/a.png">`,
		)
		expect(result.ok).toBe(true)
		expect(result.stats.externalImageHosts).toEqual(['example.com'])
	})

	test('but warns when there is no title', () => {
		const result = validateHtml('<p>no title here</p>')
		expect(result.ok).toBe(true)
		expect(result.title).toBeNull()
		expect(result.warnings.join(' ')).toMatch(/No <title>/)
	})
})

describe('html policy — blocked tags', () => {
	for (const tag of [
		'form',
		'iframe',
		'object',
		'embed',
		'applet',
		'base',
		'link',
	]) {
		test(`<${tag}> is rejected`, () => {
			const result = validateHtml(`<title>t</title><${tag}></${tag}>`)
			expect(result.ok).toBe(false)
			expect(result.errors.join(' ')).toContain(`Blocked <${tag}> tag found.`)
		})
	}
})

describe('html policy — script rules', () => {
	test('external script src is rejected', () => {
		const result = validateHtml(
			`<title>t</title><script src="https://cdn.example.com/x.js"></script>`,
		)
		expect(result.ok).toBe(false)
		expect(result.errors).toContain('External script sources are not allowed.')
	})

	test('an unsupported script type is rejected', () => {
		const result = validateHtml(
			`<title>t</title><script type="text/x-template">x</script>`,
		)
		expect(result.ok).toBe(false)
		expect(result.errors.join(' ')).toMatch(/Unsupported script type/)
	})
})

describe('html policy — attributes', () => {
	test('inline event handlers are rejected', () => {
		const result = validateHtml(`<title>t</title><div onclick="x()">a</div>`)
		expect(result.ok).toBe(false)
		expect(result.errors.join(' ')).toContain('onclick')
	})

	test('srcdoc is rejected', () => {
		const result = validateHtml(
			`<title>t</title><div srcdoc="<b>x</b>">a</div>`,
		)
		expect(result.ok).toBe(false)
		expect(result.errors).toContain('Blocked "srcdoc" attribute found.')
	})

	test('javascript: URLs are rejected', () => {
		const result = validateHtml(
			`<title>t</title><a href="javascript:alert(1)">x</a>`,
		)
		expect(result.ok).toBe(false)
		expect(result.errors.join(' ')).toMatch(/Blocked unsafe URL/)
	})

	test('javascript: URLs split by control characters are still rejected', () => {
		const result = validateHtml(
			`<title>t</title><a href="java	script:alert(1)">x</a>`,
		)
		expect(result.ok).toBe(false)
		expect(result.errors.join(' ')).toMatch(/Blocked unsafe URL/)
	})

	test('vbscript: and file: URLs are rejected', () => {
		expect(validateHtml(`<title>t</title><a href="vbscript:x">x</a>`).ok).toBe(
			false,
		)
		expect(validateHtml(`<title>t</title><a href="file:///etc">x</a>`).ok).toBe(
			false,
		)
	})

	test('unsafe inline CSS is rejected', () => {
		const result = validateHtml(
			`<title>t</title><div style="width: expression(alert(1))">a</div>`,
		)
		expect(result.ok).toBe(false)
		expect(result.errors).toContain('Blocked unsafe inline CSS.')
	})

	test('an ordinary https href is fine', () => {
		expect(
			validateHtml(`<title>t</title><a href="https://example.com">x</a>`).ok,
		).toBe(true)
	})
})

describe('html policy — meta refresh', () => {
	test('is rejected', () => {
		const result = validateHtml(
			`<title>t</title><meta http-equiv="refresh" content="0;url=https://example.com">`,
		)
		expect(result.ok).toBe(false)
		expect(result.errors).toContain('Blocked meta refresh tag found.')
	})

	test('other meta tags are fine', () => {
		expect(validateHtml(`<title>t</title><meta charset="utf-8">`).ok).toBe(true)
	})
})

describe('html policy — limits', () => {
	test('the default cap is 5 MB', () => {
		expect(DEFAULT_MAX_BYTES).toBe(5 * 1024 * 1024)
	})

	test('an oversized document is rejected', () => {
		const big = `<title>t</title>${'x'.repeat(DEFAULT_MAX_BYTES)}`
		const result = validateHtml(big)
		expect(result.ok).toBe(false)
		expect(result.errors.join(' ')).toMatch(/maximum is 5242880 bytes/)
	})

	test('the cap is configurable', () => {
		const result = validateHtml(`<title>t</title>`, { maxBytes: 4 })
		expect(result.ok).toBe(false)
		expect(result.errors.join(' ')).toMatch(/maximum is 4 bytes/)
	})

	test('an empty document is rejected', () => {
		expect(validateHtml('').errors).toContain('HTML document is empty.')
		expect(validateHtml('   ').errors).toContain('HTML document is empty.')
		expect(validateHtml(null).errors).toContain('HTML document is empty.')
	})

	test('excessive nesting is rejected', () => {
		const deep = `<title>t</title>${'<div>'.repeat(600)}x${'</div>'.repeat(600)}`
		const result = validateHtml(deep)
		expect(result.ok).toBe(false)
		expect(result.errors.join(' ')).toMatch(/nested more than 512 levels deep/)
	})

	test('duplicate errors are reported once', () => {
		const result = validateHtml(
			`<title>t</title><iframe></iframe><iframe></iframe>`,
		)
		expect(
			result.errors.filter((e) => e === 'Blocked <iframe> tag found.'),
		).toHaveLength(1)
	})
})
