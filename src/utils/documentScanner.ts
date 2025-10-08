// Document scanning utilities for image enhancement
export const enhanceDocument = async (imageFile: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    img.onload = () => {
      // Set canvas size to image size
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Apply document enhancement
      // 1. Convert to grayscale
      // 2. Increase contrast
      // 3. Sharpen edges
      for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        
        // Increase contrast (simple linear stretch)
        const contrast = 1.3;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        let enhanced = factor * (avg - 128) + 128;
        
        // Clamp values
        enhanced = Math.max(0, Math.min(255, enhanced));
        
        // Apply threshold for sharper document look
        const threshold = 180;
        if (enhanced > threshold) {
          enhanced = 255;
        } else {
          enhanced = enhanced * 0.8;
        }
        
        data[i] = enhanced;     // R
        data[i + 1] = enhanced; // G
        data[i + 2] = enhanced; // B
      }

      // Put enhanced image data back
      ctx.putImageData(imageData, 0, 0);

      // Apply additional sharpening using convolution
      sharpenImage(ctx, canvas.width, canvas.height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        0.95
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(imageFile);
  });
};

function sharpenImage(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const weights = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  
  const side = Math.round(Math.sqrt(weights.length));
  const halfSide = Math.floor(side / 2);
  const output = ctx.createImageData(width, height);
  const dst = output.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstOff = (y * width + x) * 4;
      let r = 0, g = 0, b = 0;

      for (let cy = 0; cy < side; cy++) {
        for (let cx = 0; cx < side; cx++) {
          const scy = Math.min(height - 1, Math.max(0, y + cy - halfSide));
          const scx = Math.min(width - 1, Math.max(0, x + cx - halfSide));
          const srcOff = (scy * width + scx) * 4;
          const wt = weights[cy * side + cx];

          r += data[srcOff] * wt;
          g += data[srcOff + 1] * wt;
          b += data[srcOff + 2] * wt;
        }
      }

      dst[dstOff] = Math.max(0, Math.min(255, r));
      dst[dstOff + 1] = Math.max(0, Math.min(255, g));
      dst[dstOff + 2] = Math.max(0, Math.min(255, b));
      dst[dstOff + 3] = data[dstOff + 3];
    }
  }

  ctx.putImageData(output, 0, 0);
}

// Detect if device is mobile
export const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};
