/**
 * Get full image URL
 * - If URL starts with http/https, return as-is (Supabase URL)
 * - Otherwise, prepend backend API URL (legacy local files)
 */
export function getImageUrl(url: string | null | undefined, apiUrl?: string): string {
  if (!url) {
    return '';
  }

  // If already a full URL (Supabase Storage), return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Legacy local file - prepend API URL
  const backendUrl = apiUrl || process.env.NEXT_PUBLIC_API_URL || 'https://api.jaclit.com';
  return `${backendUrl}${url}`;
}
