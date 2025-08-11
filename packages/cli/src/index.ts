#!/usr/bin/env bun

import { cli, z } from 'zlye'
import { version } from '../package.json'

const program = cli()
	.name('@bunup/cli')
	.description("Bunup's CLI that does the heavy lifting.")
	.version(version)

program
	.command('init')
	.description('Initialize bunup in an existing project')
	.action(async () => {
		const { init } = await import('./init')
		await init()
	})

program
	.command('create')
	.description('Scaffold a new project with Bunup')
	.positional(
		'project-name',
		z.string().describe('The name of the project').optional(),
	)
	.action(async ({ positionals }) => {
		const { createProject } = await import('./create')
		await createProject(positionals[0])
	})

program.parse()
