import fs from 'node:fs'
import path from 'node:path'
import {
	confirm,
	intro,
	log,
	multiselect,
	outro,
	select,
	tasks,
	text,
} from '@clack/prompts'
import pc from 'picocolors'
import { exec } from 'tinyexec'
import { loadPackageJson } from './loaders'
import { formatListWithAnd, link } from './utils'

interface WorkspacePackage {
	name: string
	root: string
	entryFiles: string[]
	outputFormats: string[]
}

export async function init(): Promise<void> {
	intro(pc.bgCyan(pc.black(' Initialize bunup in an existing project ')))

	const { path: packageJsonPath } = await loadPackageJson()

	if (!packageJsonPath) {
		log.error('package.json not found')
		process.exit(1)
	}

	const shouldSetupWorkspace = await promptForWorkspace()

	if (shouldSetupWorkspace) {
		await initializeWorkspace(packageJsonPath)
	} else {
		await initializeSinglePackage(packageJsonPath)
	}

	await tasks([
		{
			title: 'Installing bunup',
			task: async () => {
				await installBunup()
				return 'Bunup installed'
			},
		},
	])

	showSuccessOutro(shouldSetupWorkspace)
}

async function promptForWorkspace(): Promise<boolean> {
	return (await confirm({
		message:
			'Do you want to setup a Bunup workspace? (for building multiple packages with one command)',
		initialValue: false,
	})) as boolean
}

async function initializeWorkspace(packageJsonPath: string): Promise<void> {
	const workspacePackages = await collectWorkspacePackages()
	const configMethod = await selectWorkspaceConfigurationMethod()

	await generateWorkspaceConfiguration(configMethod, workspacePackages)
	await handleWorkspaceBuildScripts(packageJsonPath)
}

async function initializeSinglePackage(packageJsonPath: string): Promise<void> {
	const entryFiles = await collectEntryFiles()
	const outputFormats = await selectOutputFormats()
	const configMethod = await selectConfigurationMethod()

	await generateConfiguration(
		configMethod,
		entryFiles,
		outputFormats,
		packageJsonPath,
	)

	await handleBuildScripts(
		packageJsonPath,
		entryFiles,
		outputFormats,
		configMethod,
	)
}

async function collectWorkspacePackages(): Promise<WorkspacePackage[]> {
	const packages: WorkspacePackage[] = []

	while (true) {
		const packageName = (await text({
			message:
				packages.length > 0
					? 'Enter the next package name:'
					: 'Enter the first package name:',
			placeholder: 'core',
			validate: (value) => {
				if (!value) return 'Package name is required'
				if (packages.some((pkg) => pkg.name === value))
					return 'Package name already exists'
			},
		})) as string

		const packageRoot = (await text({
			message: `Enter the root directory for "${packageName}":`,
			placeholder: `packages/${packageName}`,
			defaultValue: `packages/${packageName}`,
			validate: (value) => {
				if (!value) return 'Package root is required'
				if (!fs.existsSync(value))
					return 'Package root directory does not exist'
				if (!fs.statSync(value).isDirectory())
					return 'Package root must be a directory'
			},
		})) as string

		const entryFiles = await collectEntryFilesForPackage(
			packageRoot,
			packageName,
		)
		const outputFormats = await selectOutputFormats()

		packages.push({
			name: packageName,
			root: packageRoot,
			entryFiles,
			outputFormats,
		})

		const shouldAddMore = await confirm({
			message: 'Do you want to add another package?',
			initialValue: true,
		})

		if (!shouldAddMore) break
	}

	return packages
}

async function collectEntryFilesForPackage(
	packageRoot: string,
	packageName: string,
): Promise<string[]> {
	const entryFiles: string[] = []

	while (true) {
		const entryFile = (await text({
			message:
				entryFiles.length > 0
					? `Where is the next entry file for "${packageName}"? (relative to ${packageRoot})`
					: `Where is the entry file for "${packageName}"? (relative to ${packageRoot})`,
			placeholder: 'src/index.ts',
			defaultValue: 'src/index.ts',
			validate: (value) => {
				if (!value) return 'Entry file is required'

				const fullPath = path.join(packageRoot, value)
				if (!fs.existsSync(fullPath))
					return `Entry file does not exist at ${fullPath}`
				if (!fs.statSync(fullPath).isFile()) return 'Entry file must be a file'
				if (entryFiles.includes(value))
					return 'You have already added this entry file'
			},
		})) as string

		entryFiles.push(entryFile)

		const shouldAddMore = await confirm({
			message: 'Do you want to add another entry file for this package?',
			initialValue: false,
		})

		if (!shouldAddMore) break
	}

	return entryFiles
}

async function collectEntryFiles(): Promise<string[]> {
	const entryFiles: string[] = []

	while (true) {
		const entryFile = (await text({
			message:
				entryFiles.length > 0
					? 'Where is your next entry file?'
					: 'Where is your entry file?',
			placeholder: 'src/index.ts',
			defaultValue: 'src/index.ts',
			validate: (value) => {
				if (!value) return 'Entry file is required'
				if (!fs.existsSync(value)) return 'Entry file does not exist'
				if (!fs.statSync(value).isFile()) return 'Entry file must be a file'
				if (entryFiles.includes(value))
					return 'You have already added this entry file'
			},
		})) as string

		entryFiles.push(entryFile)

		const shouldAddMore = await confirm({
			message: 'Do you want to add another entry file?',
			initialValue: false,
		})

		if (!shouldAddMore) break
	}

	return entryFiles
}

async function selectOutputFormats(): Promise<string[]> {
	return (await multiselect({
		message: 'Select the output formats',
		options: [
			{ value: 'esm', label: 'ESM (.mjs)' },
			{ value: 'cjs', label: 'CommonJS (.cjs)' },
			{ value: 'iife', label: 'IIFE (.global.js)' },
		],
		initialValues: ['esm', 'cjs'],
	})) as string[]
}

async function selectWorkspaceConfigurationMethod(): Promise<string> {
	return (await select({
		message: 'How would you like to configure your workspace?',
		options: [
			{ value: 'ts', label: 'bunup.config.ts', hint: 'Recommended' },
			{ value: 'js', label: 'bunup.config.js' },
		],
		initialValue: 'ts',
	})) as string
}

async function selectConfigurationMethod(): Promise<string> {
	return (await select({
		message: 'How would you like to configure Bunup?',
		options: [
			{ value: 'ts', label: 'bunup.config.ts', hint: 'Recommended' },
			{ value: 'js', label: 'bunup.config.js' },
			{ value: 'json', label: 'package.json "bunup" property' },
			{
				value: 'none',
				label: 'No config file',
				hint: 'Configure via CLI only',
			},
		],
		initialValue: 'ts',
	})) as string
}

async function generateWorkspaceConfiguration(
	configMethod: string,
	workspacePackages: WorkspacePackage[],
): Promise<void> {
	const configContent = createWorkspaceConfigFileContent(workspacePackages)
	await Bun.write(`bunup.config.${configMethod}`, configContent)
}

async function generateConfiguration(
	configMethod: string,
	entryFiles: string[],
	outputFormats: string[],
	packageJsonPath: string,
): Promise<void> {
	if (configMethod === 'none') {
		log.info(
			'If you need more control (such as adding plugins or customizing output), you can always create a config file later.',
		)
		return
	}

	if (configMethod === 'ts' || configMethod === 'js') {
		await Bun.write(
			`bunup.config.${configMethod}`,
			createConfigFileContent(entryFiles, outputFormats),
		)
	} else if (configMethod === 'json') {
		const { data: packageJsonConfig } = await loadPackageJson()

		const updatedConfig = {
			...packageJsonConfig,
			bunup: createPackageJsonConfig(entryFiles, outputFormats),
		}
		await Bun.write(packageJsonPath, JSON.stringify(updatedConfig, null, 2))
	}
}

async function handleWorkspaceBuildScripts(
	packageJsonPath: string,
): Promise<void> {
	const { data: packageJsonConfig } = await loadPackageJson()
	const existingScripts = (packageJsonConfig?.scripts ?? {}) as Record<
		string,
		string
	>
	const newScripts = createWorkspaceBuildScripts()

	const conflictingScripts = Object.keys(newScripts).filter(
		(script) => existingScripts[script],
	)

	if (conflictingScripts.length > 0) {
		const shouldOverride = await confirm({
			message: `The ${formatListWithAnd(conflictingScripts)} ${conflictingScripts.length > 1 ? 'scripts already exist' : 'script already exists'} in package.json. Override ${conflictingScripts.length > 1 ? 'them' : 'it'}?`,
			initialValue: true,
		})

		if (!shouldOverride) {
			log.info('Skipped adding build scripts to avoid conflicts.')
			return
		}
	}

	const updatedConfig = {
		...packageJsonConfig,
		scripts: { ...existingScripts, ...newScripts },
	}

	await Bun.write(packageJsonPath, JSON.stringify(updatedConfig, null, 2))
}

async function handleBuildScripts(
	packageJsonPath: string,
	entryFiles: string[],
	outputFormats: string[],
	configMethod: string,
): Promise<void> {
	const { data: packageJsonConfig } = await loadPackageJson()

	const existingScripts = (packageJsonConfig?.scripts ?? {}) as Record<
		string,
		string
	>
	const newScripts = createBuildScripts(entryFiles, outputFormats, configMethod)

	const conflictingScripts = Object.keys(newScripts).filter(
		(script) => existingScripts[script],
	)

	if (conflictingScripts.length > 0) {
		const shouldOverride = await confirm({
			message: `The ${formatListWithAnd(conflictingScripts)} ${conflictingScripts.length > 1 ? 'scripts already exist' : 'script already exists'} in package.json. Override ${conflictingScripts.length > 1 ? 'them' : 'it'}?`,
			initialValue: true,
		})

		if (!shouldOverride) {
			log.info('Skipped adding build scripts to avoid conflicts.')
			return
		}
	}

	const updatedConfig = {
		...packageJsonConfig,
		scripts: { ...existingScripts, ...newScripts },
	}

	await Bun.write(packageJsonPath, JSON.stringify(updatedConfig, null, 2))
}

function createWorkspaceConfigFileContent(
	workspacePackages: WorkspacePackage[],
): string {
	const packagesConfig = workspacePackages
		.map((pkg) => {
			return `  {
    name: '${pkg.name}',
    root: '${pkg.root}',
    config: {
      entry: [${pkg.entryFiles.map((file) => `'${file}'`).join(', ')}],
      format: [${pkg.outputFormats.map((format) => `'${format}'`).join(', ')}],
    },
  }`
		})
		.join(',\n')

	return `import { defineWorkspace } from 'bunup'

export default defineWorkspace([
${packagesConfig}
])
`
}

function createConfigFileContent(
	entryFiles: string[],
	outputFormats: string[],
): string {
	return `import { defineConfig } from 'bunup'

export default defineConfig({
	entry: [${entryFiles.map((file) => `'${file}'`).join(', ')}],
	format: [${outputFormats.map((format) => `'${format}'`).join(', ')}],
})
`
}

function createPackageJsonConfig(
	entryFiles: string[],
	outputFormats: string[],
): Record<string, unknown> {
	return {
		entry: entryFiles,
		format: outputFormats,
	}
}

function createWorkspaceBuildScripts(): Record<string, string> {
	return {
		build: 'bunup',
		dev: 'bunup --watch',
	}
}

function createBuildScripts(
	entryFiles: string[],
	outputFormats: string[],
	configMethod: string,
): Record<string, string> {
	const cliOptions =
		configMethod === 'none'
			? ` ${entryFiles.join(' ')} --format ${outputFormats.join(',')}`
			: ''

	return {
		build: `bunup${cliOptions}`,
		dev: `bunup${cliOptions} --watch`,
	}
}

function showSuccessOutro(isWorkspace: boolean): void {
	const buildCommand = isWorkspace
		? `${pc.cyan('bun run build')} - Build all packages in your workspace`
		: `${pc.cyan('bun run build')} - Build your library`

	const devCommand = isWorkspace
		? `${pc.cyan('bun run dev')} - Start development mode (watches all packages)`
		: `${pc.cyan('bun run dev')} - Start development mode`

	const filterCommand = isWorkspace
		? `${pc.cyan('bunup --filter core,utils')} - Build specific packages`
		: ''

	outro(`
   ${pc.green('✨ Bunup initialized successfully! ✨')}

   ${buildCommand}
   ${devCommand}${isWorkspace ? `\n   ${filterCommand}` : ''}
  
   ${pc.dim('Learn more:')} ${link('https://bunup.dev/', 'https://bunup.dev/')}
  
   ${pc.yellow('Happy building!')} 🚀
  `)
}

async function installBunup() {
	await exec('bun add -d bunup', [], {
		nodeOptions: { shell: true, stdio: 'pipe' },
	})
}
