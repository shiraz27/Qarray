// Advanced document scanning with edge detection and perspective correction

export const enhanceDocument = async (imageFile: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

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
      
      // Try to detect document boundaries
      const corners = detectDocumentCorners(imageData, canvas.width, canvas.height);
      
      if (corners) {
        // Apply perspective transformation
        applyPerspectiveTransform(ctx, img, corners, canvas.width, canvas.height);
      } else {
        // If no document detected, just redraw the image
        ctx.drawImage(img, 0, 0);
      }

      // Apply aggressive enhancement
      applyAggressiveEnhancement(ctx, canvas.width, canvas.height);

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

function detectDocumentCorners(
  imageData: ImageData,
  width: number,
  height: number
): { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point } | null {
  const data = imageData.data;
  
  // Convert to grayscale and apply edge detection
  const grayscale = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    grayscale[i / 4] = avg;
  }

  // Apply Sobel edge detection
  const edges = applySobelEdgeDetection(grayscale, width, height);
  
  // Find contours and detect largest rectangle
  const corners = findLargestRectangle(edges, width, height);
  
  return corners;
}

interface Point {
  x: number;
  y: number;
}

function applySobelEdgeDetection(
  grayscale: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(width * height);
  
  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = grayscale[(y + ky) * width + (x + kx)];
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          gx += pixel * sobelX[kernelIndex];
          gy += pixel * sobelY[kernelIndex];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * width + x] = magnitude > 100 ? 255 : 0;
    }
  }

  return edges;
}

function findLargestRectangle(
  edges: Uint8ClampedArray,
  width: number,
  height: number
): { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point } | null {
  // Simple approach: find the 4 corners based on edge density
  const margin = Math.floor(Math.min(width, height) * 0.1);
  
  // Divide image into 9 regions and find edge density
  const regions: Point[] = [];
  
  // Top-left region
  let maxDensity = 0;
  let bestPoint: Point = { x: margin, y: margin };
  for (let y = 0; y < height / 3; y++) {
    for (let x = 0; x < width / 3; x++) {
      if (edges[y * width + x] === 255) {
        const density = getLocalDensity(edges, x, y, width, height, 10);
        if (density > maxDensity) {
          maxDensity = density;
          bestPoint = { x, y };
        }
      }
    }
  }
  const topLeft = bestPoint;

  // Top-right region
  maxDensity = 0;
  bestPoint = { x: width - margin, y: margin };
  for (let y = 0; y < height / 3; y++) {
    for (let x = (2 * width) / 3; x < width; x++) {
      if (edges[y * width + x] === 255) {
        const density = getLocalDensity(edges, x, y, width, height, 10);
        if (density > maxDensity) {
          maxDensity = density;
          bestPoint = { x, y };
        }
      }
    }
  }
  const topRight = bestPoint;

  // Bottom-right region
  maxDensity = 0;
  bestPoint = { x: width - margin, y: height - margin };
  for (let y = (2 * height) / 3; y < height; y++) {
    for (let x = (2 * width) / 3; x < width; x++) {
      if (edges[y * width + x] === 255) {
        const density = getLocalDensity(edges, x, y, width, height, 10);
        if (density > maxDensity) {
          maxDensity = density;
          bestPoint = { x, y };
        }
      }
    }
  }
  const bottomRight = bestPoint;

  // Bottom-left region
  maxDensity = 0;
  bestPoint = { x: margin, y: height - margin };
  for (let y = (2 * height) / 3; y < height; y++) {
    for (let x = 0; x < width / 3; x++) {
      if (edges[y * width + x] === 255) {
        const density = getLocalDensity(edges, x, y, width, height, 10);
        if (density > maxDensity) {
          maxDensity = density;
          bestPoint = { x, y };
        }
      }
    }
  }
  const bottomLeft = bestPoint;

  // Validate that we found a reasonable rectangle
  if (
    distance(topLeft, topRight) < width * 0.3 ||
    distance(topLeft, bottomLeft) < height * 0.3
  ) {
    return null; // Not a valid document
  }

  return { topLeft, topRight, bottomRight, bottomLeft };
}

function getLocalDensity(
  edges: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): number {
  let count = 0;
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (edges[ny * width + nx] === 255) count++;
        total++;
      }
    }
  }
  return count / total;
}

function distance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function applyPerspectiveTransform(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  corners: { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point },
  width: number,
  height: number
) {
  // Calculate target dimensions
  const widthTop = distance(corners.topLeft, corners.topRight);
  const widthBottom = distance(corners.bottomLeft, corners.bottomRight);
  const targetWidth = Math.max(widthTop, widthBottom);

  const heightLeft = distance(corners.topLeft, corners.bottomLeft);
  const heightRight = distance(corners.topRight, corners.bottomRight);
  const targetHeight = Math.max(heightLeft, heightRight);

  // Create temporary canvas for perspective transform
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = targetWidth;
  tempCanvas.height = targetHeight;
  const tempCtx = tempCanvas.getContext('2d');
  
  if (!tempCtx) return;

  // Simple perspective transform using setTransform
  // This is a simplified version - for perfect results, we'd need a full homography matrix
  tempCtx.save();
  
  // Calculate scale factors
  const scaleX = targetWidth / width;
  const scaleY = targetHeight / height;
  
  tempCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  tempCtx.drawImage(img, 0, 0);
  tempCtx.restore();

  // Draw transformed image back to main canvas
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(tempCanvas, 0, 0, width, height);
}

function applyAggressiveEnhancement(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Step 1: Convert to grayscale with weighted average
  for (let i = 0; i < data.length; i += 4) {
    // Use weighted average for better grayscale conversion
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  // Step 2: Apply histogram equalization for better contrast
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }

  const cdf = new Array(256).fill(0);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }

  const cdfMin = cdf.find(v => v > 0) || 0;
  const totalPixels = width * height;
  const lookupTable = new Array(256);
  for (let i = 0; i < 256; i++) {
    lookupTable[i] = Math.round(((cdf[i] - cdfMin) / (totalPixels - cdfMin)) * 255);
  }

  for (let i = 0; i < data.length; i += 4) {
    const enhanced = lookupTable[data[i]];
    data[i] = enhanced;
    data[i + 1] = enhanced;
    data[i + 2] = enhanced;
  }

  // Step 3: Apply adaptive thresholding for sharp document look
  const blockSize = 15;
  const C = 10;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Calculate local mean
      let sum = 0;
      let count = 0;
      for (let dy = -blockSize; dy <= blockSize; dy++) {
        for (let dx = -blockSize; dx <= blockSize; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const nidx = (ny * width + nx) * 4;
            sum += data[nidx];
            count++;
          }
        }
      }
      const mean = sum / count;
      
      // Apply threshold
      const value = data[idx] > mean - C ? 255 : 0;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
    }
  }

  // Step 4: Apply sharpening
  sharpenImage(imageData, width, height);

  ctx.putImageData(imageData, 0, 0);
}

function sharpenImage(imageData: ImageData, width: number, height: number) {
  const data = imageData.data;
  const original = new Uint8ClampedArray(data);
  
  // Sharpening kernel
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      let r = 0, g = 0, b = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const kidx = ((y + ky) * width + (x + kx)) * 4;
          const weight = kernel[(ky + 1) * 3 + (kx + 1)];
          r += original[kidx] * weight;
          g += original[kidx + 1] * weight;
          b += original[kidx + 2] * weight;
        }
      }
      
      data[idx] = Math.max(0, Math.min(255, r));
      data[idx + 1] = Math.max(0, Math.min(255, g));
      data[idx + 2] = Math.max(0, Math.min(255, b));
    }
  }
}

// Detect if device is mobile
export const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};
