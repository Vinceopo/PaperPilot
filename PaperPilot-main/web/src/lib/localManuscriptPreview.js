/**
 * Browser-local manuscript preview metadata.
 * Does not upload or call the API — DocumentPagePreview renders the File with pdf.js / docx-preview.
 */

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

function fileTypeOf(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  if (name.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
  return "pdf";
}

/**
 * @param {File|Blob|null|undefined} file
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
  const fileType = fileTypeOf(file);
  const result = {
    filename,
    file_type: fileType,
    text_preview: "",
    char_count: 0,
    page_count: 0,
    pages: [],
    // Upload happens only when the user confirms — never during preview.
    cloudinary_url: "",
    public_url: "",
  };
  if (!file || fileType !== "pdf") return result;

  let objectUrl = "";
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    objectUrl = URL.createObjectURL(file);
    const loadingTask = pdfjs.getDocument({ url: objectUrl });
    const pdf = await loadingTask.promise;
    result.page_count = Number(pdf.numPages) || 0;
    await pdf.destroy();
  } catch {
    // DocumentPagePreview still opens the local File; page badge stays optional.
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
  return result;
}
