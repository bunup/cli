import { loadConfig } from 'coffi'

type PackageJson = {
	/** The parsed content of the package.json file */
	data: Record<string, unknown> | null
	/** The path to the package.json file */
	path: string | null
}

export async function loadPackageJson(
	cwd: string = process.cwd(),
): Promise<PackageJson> {
	const { config, filepath } = await loadConfig<Record<string, unknown>>({
		name: 'package',
		cwd,
		extensions: ['.json'],
	})

	return {
		data: config,
		path: filepath,
	}
}
