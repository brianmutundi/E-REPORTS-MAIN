/**
 * Converts a name to Title Case, capitalizing the first letter after
 * spaces, hyphens, and apostrophes (e.g. "james robi" -> "James Robi",
 * "mary-jane o'brien" -> "Mary-Jane O'Brien").
 */
export function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, letter: string) => sep + letter.toUpperCase())
}
