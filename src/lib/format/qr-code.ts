/**
 * Confirmed bookings get a QR code encoding the booking reference, for
 * venue staff to scan at check-in (docs/architecture/notifications.md).
 * Not a separate system — generated on demand wherever a confirmed
 * booking is displayed to its customer.
 */
import QRCode from 'qrcode';

export async function generateBookingQrDataUrl(reference: string): Promise<string> {
  return QRCode.toDataURL(reference, { width: 160, margin: 1 });
}
