import { defineWorkspace } from 'bunup'

export default defineWorkspace([
	{
		name: 'cli',
		root: 'packages/cli',
		config: {
			entry: ['src/index.ts'],
			format: ['esm', 'cjs'],
		},
	},
])
