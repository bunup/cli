import fsSync from 'node:fs'
import pc from 'picocolors'

export function displayBunupGradientArt(): void {
	const art = `
██████╗ ██╗   ██╗███╗   ██╗██╗   ██╗██████╗ 
██╔══██╗██║   ██║████╗  ██║██║   ██║██╔══██╗
██████╔╝██║   ██║██╔██╗ ██║██║   ██║██████╔╝
██╔══██╗██║   ██║██║╚██╗██║██║   ██║██╔═══╝ 
██████╔╝╚██████╔╝██║ ╚████║╚██████╔╝██║     
╚═════╝  ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═╝     
	`.trim()

	const lines = art.split('\n')

	console.log()
	for (const line of lines) {
		console.log(pc.cyan(line))
	}
	console.log()
}

export function pathExistsSync(filePath: string): boolean {
	try {
		fsSync.accessSync(filePath)
		return true
	} catch {
		return false
	}
}

export const link = (url: string, label: string): string => {
	return `\u001b]8;;${url}\u0007${pc.underline(pc.cyan(label))}\u001b]8;;\u0007`
}
