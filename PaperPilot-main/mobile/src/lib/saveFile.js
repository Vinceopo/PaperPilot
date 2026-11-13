/**
 * Save a local file to the user's device (download), without opening a share sheet.
 *
 * Android → Storage Access Framework (user picks Downloads / folder).
 * iOS     → app Documents folder (visible in Files → On My iPhone → PaperPilot).
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

function assertLocalUri(uri) {
  const value = String(uri || "");
  if (!value) throw new Error("No file to save.");
  return value;
}

async function saveWithSaf({ sourceUri, filename, mimeType }) {
  const { StorageAccessFramework } = FileSystem;
  if (!StorageAccessFramework?.requestDirectoryPermissionsAsync) {
    throw new Error("This Android device cannot open the download folder picker.");
  }
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) {
    const err = new Error("Download cancelled. Choose a folder to save the file.");
    err.code = "cancelled";
    throw err;
  }
  const destUri = await StorageAccessFramework.createFileAsync(
    permissions.directoryUri,
    filename,
    mimeType || "application/octet-stream"
  );
  const base64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.writeAsStringAsync(destUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { saved: true, method: "saf", uri: destUri, filename };
}

async function saveToAppDocuments({ sourceUri, filename }) {
  const dir = FileSystem.documentDirectory;
  if (!dir) throw new Error("This device cannot save downloaded files.");
  const destUri = `${dir}${filename}`;
  // copyAsync fails if dest exists; overwrite by deleting first.
  const info = await FileSystem.getInfoAsync(destUri);
  if (info.exists) {
    await FileSystem.deleteAsync(destUri, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return { saved: true, method: "documents", uri: destUri, filename };
}

/**
 * @param {{ uri: string, filename: string, mimeType?: string }} opts
 * @returns {Promise<{ saved: boolean, method: string, uri: string, filename: string }>}
 */
export async function saveFileToDevice({ uri, filename, mimeType }) {
  const sourceUri = assertLocalUri(uri);
  const safeName = String(filename || "download").replace(/[\\/:*?"<>|]/g, "_");

  if (Platform.OS === "android") {
    return saveWithSaf({ sourceUri, filename: safeName, mimeType });
  }

  return saveToAppDocuments({ sourceUri, filename: safeName });
}
