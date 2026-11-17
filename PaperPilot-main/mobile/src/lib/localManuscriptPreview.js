/**
 * Device-local manuscript preview metadata.
 * Does not upload or call the API — DocumentPreview renders the local File/URI.
 */

function fileTypeOf(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.mimeType || file?.type || "").toLowerCase();
  if (name.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
  return "pdf";
}

/**
 * @param {{ name?: string, mimeType?: string, type?: string }|null|undefined} file
 * @returns {Promise<{
 *   filename: string,
 *   file_type: string,
 *   text_preview: string,
 *   char_count: number,
 *   page_count: number,
 *   pages: unknown[],
 *   cloudinary_url: string,
 *   public_url: string,
 * }>}
 */
export async function localManuscriptPreview(file) {
  const filename = String(file?.name || "manuscript.pdf");
  return {
    filename,
    file_type: fileTypeOf(file),
    text_preview: "",
    char_count: 0,
    page_count: 0,
    pages: [],
    // Upload happens only when the user confirms — never during preview.
    cloudinary_url: "",
    public_url: "",
  };
}
