
/**
 * Capitalizes the first letter of every word in a string
 * @param text - The text to capitalize
 * @returns The text with every word capitalized
 */
export function capitalizeEveryWord(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
