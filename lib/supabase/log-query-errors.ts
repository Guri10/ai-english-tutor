export function logQueryErrors(
  context: string,
  results: { error: unknown }[]
): void {
  for (const result of results) {
    if (result.error) {
      console.error(`${context}: query failed`, result.error);
    }
  }
}
