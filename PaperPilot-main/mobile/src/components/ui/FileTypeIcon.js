import { View } from "react-native";
import Svg, { Path, Rect, Text as SvgText } from "react-native-svg";

function extensionOf(name = "") {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export function resolveFileKind(fileType, filename) {
  const raw = String(fileType || "").toLowerCase().trim();
  if (raw === "pdf" || raw.includes("pdf")) return "pdf";
  if (raw === "docx" || raw === "doc" || raw.includes("word") || raw.includes("officedocument")) {
    return "docx";
  }
  const ext = extensionOf(filename);
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  return "";
}

function Glyph({ width, height, sheet, fold, band, label, labelSize }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 32 40">
      <Path d="M4 0h16l8 8v28a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill={sheet} />
      <Path d="M20 0l8 8h-6a2 2 0 0 1-2-2V0z" fill={fold} />
      <Rect x="4" y="18" width="24" height="12" rx="2" fill={band} />
      <SvgText x="16" y="27" textAnchor="middle" fontSize={labelSize} fontWeight="700" fill="#fff">
        {label}
      </SvgText>
    </Svg>
  );
}

/** Small PDF / Word badge for uploaded documents (mirrors web FileTypeIcon). */
export default function FileTypeIcon({ fileType, filename, width = 28, height = 32 }) {
  const kind = resolveFileKind(fileType, filename);
  if (kind === "pdf") {
    return (
      <Glyph width={width} height={height} sheet="#FEE2E2" fold="#FECACA" band="#DC2626" label="PDF" labelSize={7} />
    );
  }
  if (kind === "docx") {
    return (
      <Glyph width={width} height={height} sheet="#DBEAFE" fold="#BFDBFE" band="#2563EB" label="DOC" labelSize={6.5} />
    );
  }
  return (
    <View
      style={{ width, height, borderRadius: 2, borderWidth: 2, borderColor: "#cbd5e1", backgroundColor: "#fff" }}
    />
  );
}
