// Mirror WillFile.declaredTypeMatches; BE still validates the actual file signature.
export function signedReceiptFileError(file) {
  if (!file) return null;
  if (file.size === 0) return 'empty';
  if (file.size > 10 * 1024 * 1024) return 'size';
  const type = (file.type || '').split(';', 1)[0].trim().toLowerCase();
  return ['', 'application/octet-stream', 'application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(type) ? null : 'type';
}
