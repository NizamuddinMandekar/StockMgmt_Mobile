import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

// Mirrors web's Workforce/workforce-utils.js toCsvField - quotes any field
// containing a comma, quote, or newline, doubling internal quotes.
export function toCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function rowsToCsv(rows) {
  return rows.map((row) => row.map(toCsvField).join(',')).join('\n');
}

const DOWNLOAD_DIR_KEY = 'downloadFolderUri';

// Android has no direct filesystem access to the public Downloads folder -
// the user must grant access once via the Storage Access Framework picker
// (pre-targeted at the Downloads folder). The granted URI is then reused
// silently for every export after that, so this only prompts once per
// install (unless the grant gets revoked, in which case we ask again).
async function getDownloadDirUri() {
  const saved = await AsyncStorage.getItem(DOWNLOAD_DIR_KEY);
  if (saved) return saved;
  const initialUrl = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
  const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUrl);
  if (!perm.granted) return null;
  await AsyncStorage.setItem(DOWNLOAD_DIR_KEY, perm.directoryUri);
  return perm.directoryUri;
}

// Writes `content` (already-encoded per `encoding`) straight into the
// device's Downloads folder on Android. Returns the saved SAF uri, or null
// if unavailable/denied so the caller can fall back to the share sheet.
async function saveToDownloads(filename, mimeType, content, encoding) {
  if (Platform.OS !== 'android') return null;
  let dirUri = await getDownloadDirUri();
  if (!dirUri) return null;
  const dotIndex = filename.lastIndexOf('.');
  const nameWithoutExt = dotIndex === -1 ? filename : filename.slice(0, dotIndex);
  try {
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, nameWithoutExt, mimeType);
    await FileSystem.writeAsStringAsync(fileUri, content, { encoding });
    return fileUri;
  } catch (err) {
    // The saved grant may have been revoked (folder deleted/permission
    // pulled) - drop it so the next export re-prompts instead of failing
    // forever.
    await AsyncStorage.removeItem(DOWNLOAD_DIR_KEY);
    throw err;
  }
}

export async function exportCsv(filename, csvString) {
  const saved = await saveToDownloads(filename, 'text/csv', csvString, FileSystem.EncodingType.UTF8);
  if (saved) {
    Alert.alert('Downloaded', `Saved to Downloads: ${filename}`);
    return saved;
  }

  // iOS, or the user declined folder access - fall back to the OS share
  // sheet (Save to Files / Drive / WhatsApp / etc), same as before.
  const uri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, csvString, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      dialogTitle: filename,
      UTI: 'public.comma-separated-values-text',
    });
  }
  return uri;
}

export async function exportPdf(filename, html) {
  // printToFileAsync writes into its own module's cache folder, which the
  // legacy FileSystem.copyAsync can't read back (cross-module permission
  // mismatch -> "isn't readable" IOException). Asking for base64 instead and
  // writing it ourselves sidesteps that entirely.
  const { base64 } = await Print.printToFileAsync({ html, base64: true });

  const saved = await saveToDownloads(filename, 'application/pdf', base64, FileSystem.EncodingType.Base64);
  if (saved) {
    Alert.alert('Downloaded', `Saved to Downloads: ${filename}`);
    return saved;
  }

  const dest = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, {
      mimeType: 'application/pdf',
      dialogTitle: filename,
      UTI: 'com.adobe.pdf',
    });
  }
  return dest;
}
