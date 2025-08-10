import { defineWorkspace } from 'bunup'

export default defineWorkspace([
	{
		name: 'create',
		root: 'packages/create',
		config: {
			entry: ['src/index.ts'],
			format: ['esm', 'cjs'],
		},
	},
])
