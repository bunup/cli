import fs from 'node:fs'
import path from 'node:path'
import { confirm, intro, log, outro, tasks, text } from '@clack/prompts'
import pc from 'picocolors'
import { exec } from 'tinyexec'
import { loadPackageJson } from './loaders'
import { formatListWithAnd, link } from './utils'

interface WorkspacePackage {
	name: string
	root: string
	entryFiles: string[]
}

interface ConfigOptions {
	entryFiles: string[]
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

	await generateWorkspaceConfiguration(workspacePackages)
	await handleWorkspaceBuildScripts(packageJsonPath)
}

async function initializeSinglePackage(packageJsonPath: string): Promise<void> {
	const entryFiles = await collectEntryFiles()

	await generateSinglePackageConfiguration({
		entryFiles,
	})
	await handleBuildScripts(packageJsonPath)
}

async function collectWorkspacePackages(): Promise<WorkspacePackage[]> {
	const packages: WorkspacePackage[] = []

	while (true) {
		const packageName = await promptForPackageName(packages)
		const packageRoot = await promptForPackageRoot(packageName)
		const entryFiles = await collectEntryFilesForPackage(
			packageRoot,
			packageName,
		)

		packages.push({
			name: packageName,
			root: packageRoot,
			entryFiles,
		})

		const shouldAddMore = await confirm({
			message: 'Do you want to add another package?',
			initialValue: true,
		})

		if (!shouldAddMore) break
	}

	return packages
}

async function promptForPackageName(
	existingPackages: WorkspacePackage[],
): Promise<string> {
	return (await text({
		message:
			existingPackages.length > 0
				? 'Enter the next package name:'
				: 'Enter the first package name:',
		placeholder: 'core',
		validate: (value) => {
			if (!value) return 'Package name is required'
			if (existingPackages.some((pkg) => pkg.name === value))
				return 'Package name already exists'
		},
	})) as string
}

async function promptForPackageRoot(packageName: string): Promise<string> {
	return (await text({
		message: `Enter the root directory for "${packageName}":`,
		placeholder: `packages/${packageName}`,
		defaultValue: `packages/${packageName}`,
		validate: (value) => {
			if (!value) return 'Package root is required'
			if (!fs.existsSync(value)) return 'Package root directory does not exist'
			if (!fs.statSync(value).isDirectory())
				return 'Package root must be a directory'
		},
	})) as string
}

async function collectEntryFilesForPackage(
	packageRoot: string,
	packageName: string,
): Promise<string[]> {
	const entryFiles: string[] = []

	while (true) {
		const entryFile = await promptForEntryFile(
			packageRoot,
			packageName,
			entryFiles,
		)
		entryFiles.push(entryFile)

		const shouldAddMore = await confirm({
			message: `Do you want to add another entry file for ${packageName}?`,
			initialValue: false,
		})

		if (!shouldAddMore) break
	}

	return entryFiles
}

async function promptForEntryFile(
	packageRoot: string,
	packageName: string,
	existingEntryFiles: string[],
): Promise<string> {
	return (await text({
		message:
			existingEntryFiles.length > 0
				? `Where is the next entry file for "${packageName}"? (relative to ${packageRoot})`
				: `Where is the entry file for "${packageName}"? (relative to ${packageRoot})`,
		placeholder: 'src/index.ts',
		initialValue: 'src/index.ts',
		validate: (value) => {
			if (!value) return 'Entry file is required'
			const fullPath = path.join(packageRoot, value)
			if (!fs.existsSync(fullPath))
				return `Entry file does not exist at ${fullPath}`
			if (!fs.statSync(fullPath).isFile()) return 'Entry file must be a file'
			if (existingEntryFiles.includes(value))
				return 'You have already added this entry file'
		},
	})) as string
}

async function collectEntryFiles(): Promise<string[]> {
	const entryFiles: string[] = []

	while (true) {
		const entryFile = await promptForSingleEntryFile(entryFiles)
		entryFiles.push(entryFile)

		const shouldAddMore = await confirm({
			message: 'Do you want to add another entry file?',
			initialValue: false,
		})

		if (!shouldAddMore) break
	}

	return entryFiles
}

async function promptForSingleEntryFile(
	existingEntryFiles: string[],
): Promise<string> {
	return (await text({
		message:
			existingEntryFiles.length > 0
				? 'Where is your next entry file?'
				: 'Where is your entry file?',
		placeholder: 'src/index.ts',
		initialValue: 'src/index.ts',
		validate: (value) => {
			if (!value) return 'Entry file is required'
			if (!fs.existsSync(value)) return 'Entry file does not exist'
			if (!fs.statSync(value).isFile()) return 'Entry file must be a file'
			if (existingEntryFiles.includes(value))
				return 'You have already added this entry file'
		},
	})) as string
}

async function generateWorkspaceConfiguration(
	workspacePackages: WorkspacePackage[],
): Promise<void> {
	const configContent = createWorkspaceConfigContent(workspacePackages)
	await Bun.write('bunup.config.ts', configContent)
}

async function generateSinglePackageConfiguration(
	options: ConfigOptions,
): Promise<void> {
	const configContent = createSinglePackageConfigContent(options)
	await Bun.write('bunup.config.ts', configContent)
}

async function handleWorkspaceBuildScripts(
	packageJsonPath: string,
): Promise<void> {
	await handleBuildScriptsCommon(packageJsonPath, createWorkspaceBuildScripts())
}

async function handleBuildScripts(packageJsonPath: string): Promise<void> {
	await handleBuildScriptsCommon(packageJsonPath, createBuildScripts())
}

async function handleBuildScriptsCommon(
	packageJsonPath: string,
	newScripts: Record<string, string>,
): Promise<void> {
	const { data: packageJsonConfig } = await loadPackageJson()
	const existingScripts = (packageJsonConfig?.scripts ?? {}) as Record<
		string,
		string
	>

	const conflictingScripts = Object.keys(newScripts).filter(
		(script) => existingScripts[script],
	)

	if (conflictingScripts.length > 0) {
		const shouldOverride = await confirm({
			message: `The ${formatListWithAnd(conflictingScripts)} ${
				conflictingScripts.length > 1
					? 'scripts already exist'
					: 'script already exists'
			} in package.json. Override ${conflictingScripts.length > 1 ? 'them' : 'it'}?`,
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

function createWorkspaceConfigContent(
	workspacePackages: WorkspacePackage[],
): string {
	const packagesConfig = workspacePackages
		.map((pkg) => {
			const entryArray = pkg.entryFiles.map((file) => `'${file}'`).join(', ')

			return `  {
    name: '${pkg.name}',
    root: '${pkg.root}',
    config: {
      entry: [${entryArray}],
      format: ['esm', 'cjs'],
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

function createSinglePackageConfigContent(options: ConfigOptions): string {
	const { entryFiles } = options

	const entryArray = entryFiles.map((file) => `'${file}'`).join(', ')

	return `import { defineConfig } from 'bunup'

export default defineConfig({
	entry: [${entryArray}],
	format: ['esm', 'cjs']
})
`
}

function createWorkspaceBuildScripts(): Record<string, string> {
	return {
		build: 'bunup',
		dev: 'bunup --watch',
	}
}

function createBuildScripts(): Record<string, string> {
	return {
		build: 'bunup',
		dev: 'bunup --watch',
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

async function installBunup(): Promise<void> {
	await exec('bun add -d bunup@latest', [], {
		nodeOptions: { shell: true, stdio: 'pipe' },
	})
}
