const PDF_URL_LIFETIME_MS = 20_000;

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * iOS and iPadOS PWAs cannot reliably navigate a pre-opened blank tab to a
 * Blob URL after asynchronous PDF rendering. Keep the user in Cadence, finish
 * rendering, then require a fresh tap to share/save the prepared file.
 */
export function requiresInteractivePdfDelivery(): boolean {
  return isIOSDevice();
}

/**
 * Called from the user's second, explicit tap after rendering has completed.
 * Web Share gives iPhone/iPad a native Save to Files / share-sheet path without
 * relying on blocked or blank Blob tabs.
 */
export async function sharePdfBlob(blob: Blob, filename: string): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    typeof File === 'undefined'
  ) {
    return false;
  }

  const file = new File([blob], filename, { type: 'application/pdf' });
  const shareData: ShareData = { files: [file], title: filename };
  if (typeof navigator.canShare === 'function' && !navigator.canShare(shareData)) {
    return false;
  }

  await navigator.share(shareData);
  return true;
}

/** One-click download path for browsers that reliably support Blob downloads. */
export function deliverPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Safari may not consume the blob synchronously. Revoking immediately after
  // the click can leave users with no report at all.
  window.setTimeout(() => URL.revokeObjectURL(url), PDF_URL_LIFETIME_MS);
}
