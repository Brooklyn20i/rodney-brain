const PDF_URL_LIFETIME_MS = 20_000;

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * iOS blocks a new tab created after asynchronous PDF rendering has finished.
 * Open the target during the original button gesture, before any await.
 */
export function preparePdfDeliveryTarget(): Window | null {
  if (!isIOSDevice() || typeof window === 'undefined') return null;
  return window.open('', '_blank');
}

export function deliverPdfBlob(blob: Blob, filename: string, targetWindow: Window | null): void {
  const url = URL.createObjectURL(blob);

  if (targetWindow) {
    targetWindow.location.href = url;
  } else {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  // Safari may not consume the blob synchronously. Revoking immediately after
  // click/navigation can leave iPhone/iPad users with no report at all.
  window.setTimeout(() => URL.revokeObjectURL(url), PDF_URL_LIFETIME_MS);
}
