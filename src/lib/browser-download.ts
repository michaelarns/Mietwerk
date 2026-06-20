/**
 * Trigger a browser download of an in-memory text file (e.g. CSV produced by a
 * tRPC query). Client-only — uses Blob/URL/document. Keeps the download logic in
 * one place so slices don't reinvent it.
 */
export function downloadTextFile(
  fileName: string,
  content: string,
  mime = "text/csv;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
