/** Only a complete web URL becomes a link; prose and executable schemes stay text. */
const COMPLETE_HTTP_URL = /^https?:\/\/\S+$/i;

export function annotationLink(text: string): string | null {
  const value = text.trim();
  if (!COMPLETE_HTTP_URL.test(value)) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
