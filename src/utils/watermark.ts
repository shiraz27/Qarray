import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';

export type WatermarkOptions = {
  text: string;
  opacity?: number; // 0..1
  fontSize?: number;
  colorHex?: string;
  rotationDegrees?: number; // e.g. -35
  marginRatio?: number; // relative to page size
};

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '').trim();
  const full = cleaned.length === 3
    ? cleaned
        .split('')
        .map((c) => c + c)
        .join('')
    : cleaned;

  const n = parseInt(full, 16);
   
  const r = (n >> 16) & 255;
   
  const g = (n >> 8) & 255;
   
  const b = n & 255;
  return { r: r / 255, g: g / 255, b: b / 255 };
}

export async function getWatermarkText(): Promise<string> {
  try {
    return 'Qarray.tn -Aqra Blech';
  } catch {
    return 'Qarray.tn -Aqra Blech';
  }
}


export function defaultWatermarkOptions(text: string): Required<WatermarkOptions> {
  return {
    text,
    opacity: 0.18,
    fontSize: 40,
    colorHex: '#000000',
    rotationDegrees: -35,
    marginRatio: 0.08,
  };
}

async function ensureFont(doc: PDFDocument) {
  const standard = await doc.embedFont(StandardFonts.Helvetica);
  return standard;
}

export async function watermarkPdfBytes(
  inputBytes: ArrayBuffer,
  opts?: Partial<WatermarkOptions>,
): Promise<Uint8Array> {

  const text = opts?.text ?? (await getWatermarkText());
  const full = defaultWatermarkOptions(text);

  const opacity = opts?.opacity ?? full.opacity;
  const colorHex = opts?.colorHex ?? full.colorHex;
  const fontSize = opts?.fontSize ?? full.fontSize;
  const rotationDegrees = opts?.rotationDegrees ?? full.rotationDegrees;
  const marginRatio = opts?.marginRatio ?? full.marginRatio;

  const pdfDoc = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
  const font = await ensureFont(pdfDoc);

  const { r, g, b } = hexToRgb01(colorHex);

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();

    // Put multiple lines for better coverage
    const diagonalScale = Math.min(width, height) / 600;
    const effectiveFontSize = fontSize * diagonalScale;

    const x = width * marginRatio;
    const y = height * (0.55 + marginRatio / 2);

    page.drawText(full.text, {
      x,
      y,
      size: effectiveFontSize,
      font,
      color: rgb(r, g, b),
      rotate: degrees(rotationDegrees),
      opacity,
    });

    // Second copy slightly shifted for coverage
    page.drawText(full.text, {
      x: x + width * 0.05,
      y: y - height * 0.18,
      size: effectiveFontSize,
      font,
      color: rgb(r, g, b),
      rotate: degrees(rotationDegrees),
      opacity: Math.max(0.08, opacity * 0.85),
    });
  }

    const saved = await pdfDoc.save();

  return saved;
}


export async function watermarkPdfBlob(blob: Blob, opts?: Partial<WatermarkOptions>): Promise<Blob> {
  const ab = await blob.arrayBuffer();
  const bytes = await watermarkPdfBytes(ab, opts);
  // Ensure a plain ArrayBuffer-like for Blob constructor.
  const safe = new Uint8Array(bytes);
  return new Blob([safe.buffer], { type: 'application/pdf' });
}


export async function watermarkImageBlob(
  blob: Blob,
  opts?: Partial<WatermarkOptions>,
): Promise<Blob> {
  const text = opts?.text ?? (await getWatermarkText());
  const full = defaultWatermarkOptions(text);

  const opacity = opts?.opacity ?? full.opacity;
  const colorHex = opts?.colorHex ?? full.colorHex;
  const fontSize = opts?.fontSize ?? full.fontSize;
  const rotationDegrees = opts?.rotationDegrees ?? full.rotationDegrees;

  const color = colorHex;

  const imgUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image for watermark'));
      img.src = imgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // watermark
    const diagonalScale = Math.min(canvas.width, canvas.height) / 1000;
    const effectiveFontSize = fontSize * diagonalScale;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.font = `bold ${effectiveFontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    ctx.translate(cx, cy);
    ctx.rotate((rotationDegrees * Math.PI) / 180);

    // Repeat across diagonal-ish
    const step = effectiveFontSize * 1.6;
    const span = (Math.max(canvas.width, canvas.height) * 1.5) / 2;
    for (let offset = -span; offset <= span; offset += step) {
      ctx.fillText(full.text, -canvas.width * 0.45 + offset * 0.2, -canvas.height * 0.05);
    }

    ctx.restore();

    // Keep original format if possible
    const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'image/png';
    const quality = 0.92;
    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((out) => resolve(out || blob), type, quality);
    });
  } finally {
    URL.revokeObjectURL(imgUrl);
  }
}

export function triggerWatermarkedDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

