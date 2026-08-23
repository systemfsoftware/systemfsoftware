const segmentsOf = (filename: string): readonly string[] => filename.split(/[/\\]/)

export const directoriesOf = (filename: string): readonly string[] => {
  const segments = segmentsOf(filename)
  return segments.slice(0, -1)
}

export const isInternalFolder = (filename: string): boolean => directoriesOf(filename).includes('internal')
