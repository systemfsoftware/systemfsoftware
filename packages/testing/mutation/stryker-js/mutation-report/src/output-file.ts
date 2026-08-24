import { promises as fs } from 'fs'
import path from 'path'

export async function writeOutputFile(fileName: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(fileName), { recursive: true })
  await fs.writeFile(fileName, content, 'utf8')
}
