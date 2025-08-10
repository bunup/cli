import { cli, z } from 'zlye'
import { version } from '../package.json'
import { createProject } from './create'

const program = cli()
	.name('@bunup/create')
	.description('Scaffold a new project with Bunup')
	.version(version)
	.positional(
		'project-name',
		z.string().describe('The name of the project').optional(),
	)

const result = program.parse()

async function run() {
	if (result) {
		await createProject(result.positionals[0])
	}
}

run()
