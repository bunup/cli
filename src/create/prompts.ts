import * as p from '@clack/prompts'
import pc from 'picocolors'
import { randomDescriptions, randomProjectNames } from './constants'
import { getRandomItem } from './utils'

export interface ProjectConfig {
	variant: 'minimal' | 'full'
	libraryType: 'react' | 'typescript'
	stylingOption: 'pure-css' | 'css-modules' | 'tailwindcss' | null
	isMonorepo: boolean
	projectName: string
	firstPackageName: string | null
	description: string
	username: string
	repoName: string
	initGit: boolean
}

export async function collectUserInputs(): Promise<ProjectConfig> {
	const variant = await p.select({
		message: 'Select template variant',
		options: [
			{
				value: 'minimal',
				label: 'Minimal',
				hint: 'Basic starter, perfect for building your own setup',
			},
			{
				value: 'full',
				label: 'Full',
				hint: 'Publish-ready with everything you need for a modern library',
			},
		],
	})

	if (p.isCancel(variant)) {
		p.cancel('Operation cancelled')
		process.exit(0)
	}

	const libraryType = await p.select({
		message: 'What type of library do you want to create?',
		options: [
			{
				value: 'typescript',
				label: 'TypeScript Library',
			},
			{
				value: 'react',
				label: 'React Component Library',
			},
		],
	})

	if (p.isCancel(libraryType)) {
		p.cancel('Operation cancelled')
		process.exit(0)
	}

	let stylingOption = null
	let isMonorepo = false

	if (libraryType === 'react') {
		stylingOption = await p.select({
			message: 'How would you like to style your components?',
			options: [
				{ value: 'pure-css', label: 'Pure CSS', hint: 'Simple CSS files' },
				{
					value: 'css-modules',
					label: 'CSS Modules',
					hint: 'Scoped CSS with modules',
				},
				{
					value: 'tailwindcss',
					label: 'Tailwind CSS',
					hint: 'Utility-first',
				},
			],
		})

		if (p.isCancel(stylingOption)) {
			p.cancel('Operation cancelled')
			process.exit(0)
		}
	}

	if (libraryType === 'typescript') {
		const monorepoChoice = await p.confirm({
			message: 'Do you want to create a monorepo?',
			initialValue: false,
		})

		if (p.isCancel(monorepoChoice)) {
			p.cancel('Operation cancelled')
			process.exit(0)
		}

		isMonorepo = monorepoChoice as boolean
	}

	const nameLabel = isMonorepo ? 'Project name' : 'Package name'
	const defaultName = getRandomItem(randomProjectNames)

	const projectName = await p.text({
		message: nameLabel,
		placeholder: defaultName,
		defaultValue: defaultName,
		validate(value) {
			if (!value) return 'Name is required'
			if (
				!/^(?:(?:@(?:[a-z0-9-*~][a-z0-9-*._~]*)?\/[a-z0-9-._~])|[a-z0-9-~])[a-z0-9-._~]*$/.test(
					value,
				)
			) {
				return 'Invalid package name format'
			}
		},
	})

	if (p.isCancel(projectName)) {
		p.cancel('Operation cancelled')
		process.exit(0)
	}

	let firstPackageName = null
	if (isMonorepo) {
		const packageName = await p.text({
			message: 'First package name',
			placeholder: 'core',
			defaultValue: 'core',
			validate(value) {
				if (!value) return 'Package name is required'
				if (
					!/^(?:(?:@(?:[a-z0-9-*~][a-z0-9-*._~]*)?\/[a-z0-9-._~])|[a-z0-9-~])[a-z0-9-._~]*$/.test(
						value,
					)
				) {
					return 'Invalid package name format'
				}
			},
		})

		if (p.isCancel(packageName)) {
			p.cancel('Operation cancelled')
			process.exit(0)
		}

		firstPackageName = packageName as string
	}

	const defaultDescription = getRandomItem(randomDescriptions)
	const descriptionLabel = isMonorepo
		? 'First package description'
		: 'Package description'
	const description = await p.text({
		message: descriptionLabel,
		placeholder: defaultDescription,
		defaultValue: defaultDescription,
	})

	if (p.isCancel(description)) {
		p.cancel('Operation cancelled')
		process.exit(0)
	}

	const githubInfo = await p.text({
		message: 'GitHub repository (username/repo)',
		placeholder: 'username/repo-name',
		validate(value) {
			if (!value) return 'Repository info is required'
			if (!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+$/.test(value)) {
				return 'Invalid format. Use: username/repo-name'
			}
		},
	})

	if (p.isCancel(githubInfo)) {
		p.cancel('Operation cancelled')
		process.exit(0)
	}

	const [username, repoName] = (githubInfo as string).split('/')

	let initGit = false
	const initGitChoice = await p.confirm({
		message: 'Initialize a new git repository?',
		initialValue: false,
	})

	if (p.isCancel(initGitChoice)) {
		p.cancel('Operation cancelled')
		process.exit(0)
	}

	initGit = initGitChoice as boolean

	return {
		variant: variant,
		libraryType: libraryType,
		stylingOption: stylingOption,
		isMonorepo,
		projectName: projectName,
		firstPackageName,
		description: description,
		username,
		repoName,
		initGit,
	}
}

export function displayOutro(
	projectName: string,
	libraryType: 'react' | 'typescript',
	stylingOption: string | null,
	isMonorepo: boolean,
): void {
	let learnMoreLink = 'https://bunup.dev'
	let learnMoreText = 'Learn more'
	let devCommandDescription = ''

	if (libraryType === 'react') {
		if (stylingOption === 'tailwindcss') {
			learnMoreText = "Learn more about bunup's Tailwind CSS support"
			learnMoreLink = 'https://bunup.dev/docs/builtin-plugins/tailwindcss'
		} else if (
			stylingOption === 'pure-css' ||
			stylingOption === 'css-modules'
		) {
			learnMoreText = "Learn more about bunup's CSS handling"
			learnMoreLink = 'https://bunup.dev/docs/guide/css'
		}
		devCommandDescription = pc.dim(
			'(starts Bun + React to preview components real-time)',
		)
	} else if (libraryType === 'typescript') {
		if (isMonorepo) {
			learnMoreText = "Learn more about bunup's workspace support"
			learnMoreLink = 'https://bunup.dev/docs/guide/workspaces'
		}
		devCommandDescription = pc.dim('(watch mode for development)')
	}

	p.outro(`
  ${pc.green('✨ Project scaffolded successfully! ✨')}

  ${pc.bold(`Ready to launch your ${libraryType === 'react' ? 'component library' : 'TypeScript library'}?`)}

  ${pc.cyan('cd')} ${projectName}
  ${pc.cyan('bun run dev')} ${devCommandDescription}

  ${pc.dim(`${learnMoreText}:`)}
  ${pc.underline(pc.cyan(learnMoreLink))}

  ${pc.yellow('Happy coding!')} 🚀
  `)
}
