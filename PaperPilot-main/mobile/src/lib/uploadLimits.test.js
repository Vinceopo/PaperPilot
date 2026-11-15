import { describe, expect, it, vi, beforeEach } from "vitest";

const readBytesSync = vi.fn();
const close = vi.fn();
const open = vi.fn(() => ({ readBytesSync, close }));

vi.mock("expo-file-system", () => ({
  FileMode: { ReadOnly: "r" },
  File: class MockFile {
    constructor(uri) {
      this.uri = uri;
      this.size = 2048;
    }
    open() {
      return open();
    }
  },
}));

vi.mock("./plans", () => ({
  normalizeTier: (tier) => String(tier || "free").toLowerCase(),
}));

const {
  sniffKindFromBytes,
  mimeLooksAllowed,
  fileExtension,
  normalizePickedFile,
  getFileRejection,
} = await import("./uploadLimits.js");

function pdfBytes() {
  // "%PDF-1.4" + padding
  const bytes = new Uint8Array(32);
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
  bytes.set(sig);
  return bytes;
}

function docxBytes() {
  const bytes = new Uint8Array(32);
  bytes.set([0x50, 0x4b, 0x03, 0x04]);
  return bytes;
}

beforeEach(() => {
  readBytesSync.mockReset();
  close.mockReset();
  open.mockClear();
  readBytesSync.mockImplementation(() => pdfBytes());
});

describe("sniffKindFromBytes", () => {
  it("detects PDF and DOCX signatures", () => {
    expect(sniffKindFromBytes(pdfBytes())).toBe("pdf");
    expect(sniffKindFromBytes(docxBytes())).toBe("docx");
  });

  it("does not throw when given a Promise-like non-byte value (the old bug)", () => {
    const fakePromise = Promise.resolve(pdfBytes());
    expect(sniffKindFromBytes(fakePromise)).toBe("");
  });
});

describe("mimeLooksAllowed", () => {
  it("allows PDF aliases for manuscripts and rejects word MIME", () => {
    expect(mimeLooksAllowed("application/pdf", "manuscript")).toBe(true);
    expect(mimeLooksAllowed("application/x-pdf", "manuscript")).toBe(true);
    expect(
      mimeLooksAllowed(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "manuscript"
      )
    ).toBe(false);
  });
});

describe("normalizePickedFile + getFileRejection (manuscript PDF-only)", () => {
  it("adds .pdf when Android omits the extension", async () => {
    const file = await normalizePickedFile(
      { uri: "file:///cache/doc", name: "Capstone", mimeType: "application/pdf", size: 100 },
      "manuscript"
    );
    expect(fileExtension(file)).toBe(".pdf");
    expect(file.name.endsWith(".pdf")).toBe(true);
  });

  it("accepts a normal PDF manuscript", async () => {
    const file = {
      uri: "file:///cache/paper.pdf",
      name: "paper.pdf",
      mimeType: "application/pdf",
      size: 1024,
    };
    expect(await getFileRejection(file, "manuscript", 15 * 1024 * 1024)).toBe("");
  });

  it("rejects DOCX for manuscripts even if the bytes look like a zip", async () => {
    readBytesSync.mockImplementation(() => docxBytes());
    const file = {
      uri: "file:///cache/guide.docx",
      name: "guide.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 1024,
    };
    expect(await getFileRejection(file, "manuscript", 15 * 1024 * 1024)).toBe("type");
  });

  it("rejects oversize PDFs", async () => {
    const file = {
      uri: "file:///cache/big.pdf",
      name: "big.pdf",
      mimeType: "application/pdf",
      size: 20 * 1024 * 1024,
    };
    expect(await getFileRejection(file, "manuscript", 15 * 1024 * 1024)).toBe("size");
  });

  it("uses readBytesSync (not async readBytes) so head.subarray works", async () => {
    await getFileRejection(
      { uri: "file:///cache/a.pdf", name: "a.pdf", mimeType: "application/pdf", size: 10 },
      "manuscript",
      15 * 1024 * 1024
    );
    expect(readBytesSync).toHaveBeenCalled();
    const returned = readBytesSync.mock.results[0]?.value;
    expect(typeof returned.subarray).toBe("function");
  });
});
