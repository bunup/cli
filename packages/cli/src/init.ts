import fs from 'node:fs'
import path from 'node:path'
import {
	confirm,
	intro,
	log,
	multiselect,
	outro,
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
	const plugins = await selectProductivityPlugins()

	await generateWorkspaceConfiguration(workspacePackages, plugins)
	await handleWorkspaceBuildScripts(packageJsonPath)
}

async function initializeSinglePackage(packageJsonPath: string): Promise<void> {
	const entryFiles = await collectEntryFiles()
	const outputFormats = await selectOutputFormats()
	const plugins = await selectProductivityPlugins()

	await generateConfiguration(entryFiles, outputFormats, plugins)
	await handleBuildScripts(packageJsonPath)
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
			initialValue: 'src/index.ts',
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
			initialValue: 'src/index.ts',
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

async function selectProductivityPlugins(): Promise<string[]> {
	return (await multiselect({
		message: 'Select productivity plugins that make your life easier',
		options: [
			{
				value: 'exports',
				label: 'Exports',
				hint: 'Automatically generates and updates the exports field in package.json',
			},
			{
				value: 'unused',
				label: 'Unused',
				hint: 'Detects and reports unused dependencies in your project',
			},
		],
		initialValues: ['exports', 'unused'],
		required: false,
	})) as string[]
}

async function generateWorkspaceConfiguration(
	workspacePackages: WorkspacePackage[],
	plugins: string[],
): Promise<void> {
	const configContent = createWorkspaceConfigFileContent(
		workspacePackages,
		plugins,
	)
	await Bun.write('bunup.config.ts', configContent)
}

async function generateConfiguration(
	entryFiles: string[],
	outputFormats: string[],
	plugins: string[],
): Promise<void> {
	await Bun.write(
		'bunup.config.ts',
		createConfigFileContent(entryFiles, outputFormats, plugins),
	)
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

async function handleBuildScripts(packageJsonPath: string): Promise<void> {
	const { data: packageJsonConfig } = await loadPackageJson()

	const existingScripts = (packageJsonConfig?.scripts ?? {}) as Record<
		string,
		string
	>
	const newScripts = createBuildScripts()

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
	plugins: string[],
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

	const pluginImports =
		plugins.length > 0 ? plugins.map((plugin) => plugin).join(', ') : ''

	const pluginsConfig =
		plugins.length > 0
			? `,
  {
    // Shared configuration applied to all packages
    plugins: [${plugins.map((plugin) => `${plugin}()`).join(', ')}],
  }`
			: ''

	const imports =
		plugins.length > 0
			? `import { defineWorkspace } from 'bunup'
import { ${pluginImports} } from 'bunup/plugins'`
			: `import { defineWorkspace } from 'bunup'`

	return `${imports}

export default defineWorkspace([
${packagesConfig}
]${pluginsConfig})
`
}

function createConfigFileContent(
	entryFiles: string[],
	outputFormats: string[],
	plugins: string[],
): string {
	const pluginImports =
		plugins.length > 0 ? plugins.map((plugin) => plugin).join(', ') : ''

	const pluginsConfig =
		plugins.length > 0
			? `,
	plugins: [${plugins.map((plugin) => `${plugin}()`).join(', ')}],`
			: ''

	const imports =
		plugins.length > 0
			? `import { defineConfig } from 'bunup'
import { ${pluginImports} } from 'bunup/plugins'`
			: `import { defineConfig } from 'bunup'`

	return `${imports}

export default defineConfig({
	entry: [${entryFiles.map((file) => `'${file}'`).join(', ')}],
	format: [${outputFormats.map((format) => `'${format}'`).join(', ')}],${pluginsConfig}
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

async function installBunup() {
	await exec('bun add -d bunup', [], {
		nodeOptions: { shell: true, stdio: 'pipe' },
	})
}
