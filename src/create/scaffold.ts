import path from 'node:path'
import * as p from '@clack/prompts'
import { $ } from 'bun'
import { downloadTemplate } from 'giget'
import pc from 'picocolors'
import { replaceInFile } from 'replace-in-file'
import { templateConfig } from './constants'
import type { ProjectConfig } from './prompts'
import {
	extractPackageName,
	replaceTemplateVariablesInFilenames,
	stripNonAlphabeticCharacters,
} from './utils'

function getTemplateDirectory(config: ProjectConfig): string {
	if (config.libraryType === 'react') {
		return templateConfig[config.variant].react[
			config.stylingOption as keyof typeof templateConfig.minimal.react
		]
	}

	const tsConfig = templateConfig[config.variant].typescript
	return config.isMonorepo ? tsConfig.monorepo : tsConfig.single
}

function prepareVariables(config: ProjectConfig): Record<string, string> {
	const firstPackageNameFull = config.firstPackageName || config.projectName
	const projectName = config.projectName
	const firstPackageName = extractPackageName(firstPackageNameFull)

	return {
		project_name: projectName,
		project_description: config.description,
		repo_name: config.repoName,
		username: config.username,
		first_package_name: firstPackageName,
		package_name_letters_only: firstPackageName
			? stripNonAlphabeticCharacters(firstPackageName)
			: stripNonAlphabeticCharacters(projectName),
	}
}

export async function scaffoldProject(config: ProjectConfig): Promise<void> {
	const templateDir = getTemplateDirectory(config)
	const projectPath = path.join(
		process.cwd(),
		extractPackageName(config.projectName),
	)
	const s = p.spinner()

	s.start(`Creating ${config.projectName}...`)

	try {
		await downloadTemplate(`github:bunup/templates/${templateDir}`, {
			dir: projectPath,
		})

		s.message('Applying template variables...')

		const variables = prepareVariables(config)

		const replacements = Object.entries(variables).map(([key, value]) => ({
			from: new RegExp(`\\[${key}\\]`, 'g'),
			to: value,
		}))

		await replaceInFile({
			files: `${projectPath}/**/*`,
			from: replacements.map((r) => r.from),
			to: replacements.map((r) => r.to),
			ignore: ['node_modules', 'dist', 'bun.lock', '.git'],
		})

		await replaceTemplateVariablesInFilenames(projectPath, variables)

		s.message('Installing dependencies...')

		await $`cd ${projectPath} && bun install`.nothrow().quiet()
		await $`cd ${projectPath} && bun install`.nothrow().quiet()

		s.message('Building project...')

		await $`cd ${projectPath} && bun run build`.nothrow().quiet()

		if (config.initGit) {
			s.message('Git initializing...')

			await $`cd ${projectPath} && git init`.nothrow().quiet()
			await $`cd ${projectPath} && git add -A`.nothrow().quiet()
			await $`cd ${projectPath} && git commit -m "Initial commit from Bunup"`
				.nothrow()
				.quiet()
		}

		s.stop(`${pc.green('✓')} Project scaffolded successfully!`)
	} catch (error) {
		s.stop(`${pc.red('✗')} Failed to scaffold project`)
		p.cancel(`Error: ${error}`)
		process.exit(1)
	}
}
