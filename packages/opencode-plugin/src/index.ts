/**
 * Entry point. OpenCode calls every function this module exports as a plugin
 * (packages/opencode/src/plugin/index.ts, `getLegacyPlugins`), so the only
 * runtime export is the plugin itself; helpers live in the other modules.
 */

import { createBitplanPlugin } from './plugin.js'

export type { BitplanPluginOptions } from './plugin.js'

const BitplanPlugin = createBitplanPlugin()

export default BitplanPlugin
