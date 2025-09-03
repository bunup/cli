import { renameSync } from 'node:fs'
import path from 'node:path'
import {
	cancel,
	confirm,
	intro,
	outro,
	select,
	tasks,
	text,
} from '@clack/prompts'
import { downloadTemplate } from 'giget'
import pc from 'picocolors'
import { replaceInFile } from 'replace-in-file'
import { link, pathExistsSync } from './utils'

type TemplateVariant = 'basic' | 'full'

type Template = {
	type: 'typescript' | 'react'
	defaultName: string
	name: string
	description: string
	variants: {
		basic?: {
			dir: string
		}
		full: {
			dir: string
		}
	}
	monorepo?: {
		basic?: {
			dir: string
		}
		full: {
			dir: string
		}
	}
	placeholders: {
		[key: string]: string
	}
}

const TEMPLATE_OWNER = 'bunup'
const TEMPLATE_REPO = 'templates'
const MONOREPO_PACKAGES_DIR = 'packages'

const DEFAULT_PLACEHOLDERS = {
	GITHUB_USERNAME: 'username',
	GITHUB_REPO: 'repo-name',
	MONOREPO_FIRST_PACKAGE: 'package-1',
}

const TEMPLATES: Template[] = [
	{
		type: 'typescript',
		defaultName: 'my-ts-lib',
		name: 'TypeScript Library',
		description: 'A modern TypeScript library template',
		variants: {
			basic: {
				dir: 'ts-lib-basic',
			},
			full: {
				dir: 'ts-lib',
			},
		},
		monorepo: {
			basic: {
				dir: 'ts-lib-monorepo-basic',
			},
			full: {
				dir: 'ts-lib-monorepo',
			},
		},
		placeholders: {
			...DEFAULT_PLACEHOLDERS,
			DEFAULT_NAME: 'my-ts-lib',
		},
	},
	{
		type: 'react',
		defaultName: 'my-react-lib',
		name: 'React Library',
		description: 'A modern React component library template',
		variants: {
			basic: {
				dir: 'react-lib-basic',
			},
			full: {
				dir: 'react-lib',
			},
		},
		placeholders: {
			...DEFAULT_PLACEHOLDERS,
			DEFAULT_NAME: 'my-react-lib',
		},
	},
]

export async function createProject(
	projectNameFromCli?: string,
): Promise<void> {
	intro(pc.bgCyan(pc.black(' Scaffold a new project with Bunup ')))

	const selectedTemplateType = await select({
		message: 'Select a template',
		options: TEMPLATES.map((template) => ({
			value: template.type,
			label: pc.blue(template.name),
			hint: template.description,
		})),
	})

	const template = TEMPLATES.find((t) => t.type === selectedTemplateType)
	if (!template) {
		cancel('Invalid template')
		process.exit(1)
	}

	let selectedVariant: TemplateVariant = 'full'
	if (template.variants.basic) {
		selectedVariant = (await select({
			message: 'Choose template variant',
			options: [
				{
					value: 'basic' as const,
					label: pc.green('Basic'),
					hint: 'Basic starter with bunup config, perfect for building your own setup',
				},
				{
					value: 'full' as const,
					label: pc.blue('Full'),
					hint: 'Publish-ready with everything you need for a modern library',
				},
			],
		})) as TemplateVariant
	}

	let useMonorepo = false
	if (template.monorepo) {
		useMonorepo = (await confirm({
			message: 'Do you want to create a monorepo?',
			initialValue: false,
		})) as boolean
	}

	const projectName =
		projectNameFromCli ||
		((await text({
			message: 'Enter the project name',
			placeholder: template.defaultName,
			defaultValue: template.defaultName,
			validate: (value) => {
				if (!value) {
					return 'Project name is required'
				}
				if (value.includes(' ')) {
					return 'Project name cannot contain spaces'
				}
				if (pathExistsSync(getProjectPath(value))) {
					return 'Project already exists'
				}
			},
		})) as string)

	const projectPath = getProjectPath(projectName)

	let monorepoFirstPackageName: string | undefined
	if (useMonorepo) {
		monorepoFirstPackageName = (await text({
			message: 'Enter the name of the first package',
			placeholder: template.placeholders.MONOREPO_FIRST_PACKAGE,
			defaultValue: template.placeholders.MONOREPO_FIRST_PACKAGE,
		})) as string
	}

	const githubRepoInfo = (await text({
		message: 'GitHub username and repo name (username/repo):',
		placeholder: `${template.placeholders.GITHUB_USERNAME}/${template.placeholders.GITHUB_REPO}`,
		defaultValue: `${template.placeholders.GITHUB_USERNAME}/${template.placeholders.GITHUB_REPO}`,
	})) as string

	const [githubUsername, githubRepoName] = githubRepoInfo.split('/')

	const getTemplateDir = (): string => {
		if (useMonorepo && template.monorepo) {
			return (
				template.monorepo[selectedVariant]?.dir || template.monorepo.full.dir
			)
		}
		return template.variants[selectedVariant]?.dir || template.variants.full.dir
	}

	const templateDir = getTemplateDir()

	await tasks([
		{
			title: 'Downloading template',
			task: async () => {
				await downloadTemplate(
					`github:${TEMPLATE_OWNER}/${TEMPLATE_REPO}/${templateDir}`,
					{
						dir: projectPath,
					},
				)
				return 'Template downloaded'
			},
		},
		{
			title: 'Making the project yours',
			task: async () => {
				const replacements = [
					{
						from: new RegExp(template.placeholders.GITHUB_REPO, 'g'),
						to: githubRepoName,
					},
					{
						from: new RegExp(template.placeholders.GITHUB_USERNAME, 'g'),
						to: githubUsername,
					},
					{
						from: new RegExp(template.placeholders.DEFAULT_NAME, 'g'),
						to: projectName,
					},
				]

				if (useMonorepo && monorepoFirstPackageName) {
					replacements.push({
						from: new RegExp(template.placeholders.MONOREPO_FIRST_PACKAGE, 'g'),
						to: monorepoFirstPackageName,
					})
				}

				await replaceInFile({
					files: path.join(projectPath, '**/*'),
					from: replacements.map((r) => r.from),
					to: replacements.map((r) => r.to),
					ignore: ['node_modules', 'dist', 'bun.lock'],
				})

				if (useMonorepo && monorepoFirstPackageName) {
					const oldPackagePath = path.join(
						projectPath,
						MONOREPO_PACKAGES_DIR,
						template.placeholders.MONOREPO_FIRST_PACKAGE,
					)
					const newPackagePath = path.join(
						projectPath,
						MONOREPO_PACKAGES_DIR,
						monorepoFirstPackageName,
					)

					if (pathExistsSync(oldPackagePath)) {
						renameSync(oldPackagePath, newPackagePath)
					}
				}

				return 'Project customized'
			},
		},
	])

	outro(`
   ${pc.green('✨ Project scaffolded successfully! ✨')}
   
   ${pc.bold(`Ready to launch your ${template.name.toLowerCase()}?`)}
   
   ${pc.cyan('cd')} ${projectName}
   ${pc.cyan('bun install')}
   ${pc.cyan('bun run dev')}${pc.dim(template.type === 'react' && selectedVariant === 'full' ? ' (starts Bun + React to preview components real-time)' : ' (watch mode for development)')}
   
   ${pc.dim('Learn more:')} ${link('https://bunup.dev/', 'https://bunup.dev/')}

   ${pc.yellow('Happy coding!')} 🚀
		`)
}

function getProjectPath(projectName: string): string {
	return path.join(process.cwd(), projectName)
}
