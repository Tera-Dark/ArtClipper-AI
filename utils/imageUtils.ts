import { BoundingBox, ExportConfig } from "../types";

// Helper: Calculate color distance
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  );
}

// Helper: Check if two boxes overlap or are extremely close (within buffer)
function doBoxesIntersect(a: BoundingBox, b: BoundingBox, buffer: number = 0.005): boolean {
  return (
    a.x < b.x + b.width + buffer &&
    a.x + a.width + buffer > b.x &&
    a.y < b.y + b.height + buffer &&
    a.y + a.height + buffer > b.y
  );
}

// Helper: Merge two boxes into one
function mergeTwoBoxes(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);

  return {
    id: a.id, // Keep the first ID
    x,
    y,
    width: maxX - x,
    height: maxY - y
  };
}

// Helper: Iteratively merge overlapping boxes
function mergeOverlappingBoxes(boxes: BoundingBox[]): BoundingBox[] {
  let mergedBoxes = [...boxes];
  let hasMerged = true;

  while (hasMerged) {
    hasMerged = false;
    for (let i = 0; i < mergedBoxes.length; i++) {
      for (let j = i + 1; j < mergedBoxes.length; j++) {
        if (doBoxesIntersect(mergedBoxes[i], mergedBoxes[j])) {
          // Merge j into i
          mergedBoxes[i] = mergeTwoBoxes(mergedBoxes[i], mergedBoxes[j]);
          // Remove j
          mergedBoxes.splice(j, 1);
          hasMerged = true;
          // Restart loop since indices shifted
          j--;
        }
      }
    }
  }
  return mergedBoxes;
}


// Helper: Calculate Gradient Energy for a row (Horizontal Cut detection)
// Returns average gradient magnitude per pixel in the row
function getRowEnergy(data: Uint8ClampedArray, width: number, y: number, minX: number, maxX: number): number {
  let totalDiff = 0;
  let count = 0;

  for (let x = minX; x < maxX; x++) { // Stop 1 pixel early for pair comparison
    const idx1 = (y * width + x) * 4;
    const idx2 = (y * width + (x + 1)) * 4;

    // Skip if alpha is low (consider it 0 energy/flat)
    if (data[idx1 + 3] < 10 && data[idx2 + 3] < 10) continue;

    const dist = Math.abs(data[idx1] - data[idx2]) +
      Math.abs(data[idx1 + 1] - data[idx2 + 1]) +
      Math.abs(data[idx1 + 2] - data[idx2 + 2]);

    totalDiff += dist;
    count++;
  }

  return count > 0 ? totalDiff / count : 0;
}

// Helper: Calculate Gradient Energy for a column (Vertical Cut detection)
function getColEnergy(data: Uint8ClampedArray, width: number, height: number, x: number, minY: number, maxY: number): number {
  let totalDiff = 0;
  let count = 0;

  for (let y = minY; y < maxY; y++) {
    const idx1 = (y * width + x) * 4;
    const idx2 = ((y + 1) * width + x) * 4;

    if (data[idx1 + 3] < 10 && data[idx2 + 3] < 10) continue;

    const dist = Math.abs(data[idx1] - data[idx2]) +
      Math.abs(data[idx1 + 1] - data[idx2 + 1]) +
      Math.abs(data[idx1 + 2] - data[idx2 + 2]);

    totalDiff += dist;
    count++;
  }

  return count > 0 ? totalDiff / count : 0;
}

// Helper: Apply 1D Dilation (Max Filter) to smooth profiles and bridge gaps
function dilateProfile(profile: Float32Array, radius: number): Float32Array {
  if (radius <= 0) return profile;
  const len = profile.length;
  const result = new Float32Array(len);

  // Simple sliding window max
  for (let i = 0; i < len; i++) {
    let maxVal = 0;
    const start = Math.max(0, i - radius);
    const end = Math.min(len - 1, i + radius);
    for (let j = start; j <= end; j++) {
      if (profile[j] > maxVal) maxVal = profile[j];
    }
    result[i] = maxVal;
  }
  return result;
}

// recursive X-Y Split with Projection Profile (Energy) and Morphology
function splitBox(
  box: { minX: number, minY: number, maxX: number, maxY: number },
  data: Uint8ClampedArray, width: number, height: number,
  bgR: number, bgG: number, bgB: number, threshold: number
): BoundingBox[] {

  const { minX, minY, maxX, maxY } = box;
  const boxW = maxX - minX;
  const boxH = maxY - minY;

  // Stop if too small - strict minumum size
  if (boxW < 80 || boxH < 80) return [{
    id: `split-${Date.now()}-${Math.random()}`,
    x: minX / width, y: minY / height,
    width: boxW / width, height: boxH / height
  }];

  // --- Dynamic Tuning ---
  // Threshold (1-100): 
  // 1 = Precise (High Dilation = Bridges gaps = Fewer Splits)
  // 100 = Loose (Low Dilation = Preserves gaps = More Splits)

  const FLAT_THRESHOLD = 5; // Base noise floor

  // Dilation Radius: How far to "smear" content energy?
  // T=1 -> Radius=40 (Bridges 80px gaps). T=100 -> Radius=0.
  const dilationRadius = Math.floor(Math.max(0, (40 - (threshold * 0.4))));

  // Min Gap Size: After dilation, how big must the remaining gap be?
  const minGap = Math.max(4, Math.floor(16 - (threshold * 0.15)));

  // 1. Scan for Y-cuts (Horizontal Gutters)
  let gapStart = -1;
  const rawProfiles = new Float32Array(maxY - minY + 1);

  for (let y = minY; y <= maxY; y++) {
    rawProfiles[y - minY] = getRowEnergy(data, width, y, minX, maxX);
  }

  // Smear the profile to close small gaps
  const yProfiles = dilateProfile(rawProfiles, dilationRadius);

  for (let y = minY; y <= maxY; y++) {
    const energy = yProfiles[y - minY];

    if (energy < FLAT_THRESHOLD) {
      if (gapStart === -1) gapStart = y;
    } else {
      if (gapStart !== -1) {
        // Gap ended. Check if valid.
        if (y - gapStart >= minGap) {
          // Constraint: Don't slice off tiny headers/footers (< 30px)
          const topH = gapStart - minY;
          const bottomH = maxY - y;

          if (topH >= 30 && bottomH >= 30) {
            const topBox = { minX, minY, maxX, maxY: gapStart - 1 };
            const bottomBox = { minX, minY: y, maxX, maxY };
            return [...splitBox(topBox, data, width, height, bgR, bgG, bgB, threshold), ...splitBox(bottomBox, data, width, height, bgR, bgG, bgB, threshold)];
          }
        }
        gapStart = -1;
      }
    }
  }

  // 2. Scan for X-cuts (Vertical Gutters)
  gapStart = -1;
  const rawColProfiles = new Float32Array(maxX - minX + 1);

  for (let x = minX; x <= maxX; x++) {
    rawColProfiles[x - minX] = getColEnergy(data, width, height, x, minY, maxY);
  }

  const xProfiles = dilateProfile(rawColProfiles, dilationRadius);

  for (let x = minX; x <= maxX; x++) {
    const energy = xProfiles[x - minX];
    if (energy < FLAT_THRESHOLD) {
      if (gapStart === -1) gapStart = x;
    } else {
      if (gapStart !== -1) {
        if (x - gapStart >= minGap) {
          const leftW = gapStart - minX;
          const rightW = maxX - x;
          if (leftW >= 30 && rightW >= 30) {
            const leftBox = { minX, minY, maxX: gapStart - 1, maxY };
            const rightBox = { minX: x, minY, maxX, maxY };
            return [...splitBox(leftBox, data, width, height, bgR, bgG, bgB, threshold), ...splitBox(rightBox, data, width, height, bgR, bgG, bgB, threshold)];
          }
        }
        gapStart = -1;
      }
    }
  }

  // No cuts found
  return [{
    id: `split-${Date.now()}-${Math.random()}`,
    x: minX / width, y: minY / height,
    width: boxW / width, height: boxH / height
  }];
}

export const scanForSprites = async (imageSrc: string, threshold = 20): Promise<BoundingBox[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return resolve([]);

      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Assume background color is at (0,0)
      const bgR = data[0];
      const bgG = data[1];
      const bgB = data[2];

      const visited = new Uint8Array(width * height);
      const boxes: BoundingBox[] = [];
      const stack: number[] = [];

      // Filter
      const minDimension = Math.max(64, Math.min(width, height) * 0.05);
      const effectiveThreshold = Math.max(10, threshold);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const visitedIdx = y * width + x;

          if (visited[visitedIdx]) continue;

          const a = data[idx + 3];
          if (a < 10) { visited[visitedIdx] = 1; continue; }

          const dist = colorDistance(data[idx], data[idx + 1], data[idx + 2], bgR, bgG, bgB);

          if (dist > effectiveThreshold) {
            let minX = x, maxX = x, minY = y, maxY = y;
            stack.push(visitedIdx);
            visited[visitedIdx] = 1;

            while (stack.length > 0) {
              const curr = stack.pop()!;
              const cy = Math.floor(curr / width);
              const cx = curr % width;

              if (cx < minX) minX = cx;
              if (cx > maxX) maxX = cx;
              if (cy < minY) minY = cy;
              if (cy > maxY) maxY = cy;

              const neighbors = [curr - 1, curr + 1, curr - width, curr + width];
              for (const n of neighbors) {
                if (n >= 0 && n < visited.length && !visited[n]) {
                  // Pre-check borders/wrap
                  const ny = Math.floor(n / width);
                  const nx = n % width;
                  if (Math.abs(nx - cx) > 1 || Math.abs(ny - cy) > 1) continue;

                  const nA = data[n * 4 + 3];
                  if (nA < 10) { visited[n] = 1; continue; }

                  const nDist = colorDistance(data[n * 4], data[n * 4 + 1], data[n * 4 + 2], bgR, bgG, bgB);
                  if (nDist > effectiveThreshold) {
                    visited[n] = 1;
                    stack.push(n);
                  }
                }
              }
            }

            const w = maxX - minX + 1;
            const h = maxY - minY + 1;

            if (w >= minDimension && h >= minDimension) {
              boxes.push({
                id: `scan-${boxes.length}`,
                x: minX / width, y: minY / height,
                width: w / width, height: h / height
              });
            }
          }
        }
      }

      const mergedBoxes = mergeOverlappingBoxes(boxes);

      // Recursive Split with Projection Profile
      let finalBoxes: BoundingBox[] = [];
      for (const box of mergedBoxes) {
        const rawBox = {
          minX: Math.floor(box.x * width),
          minY: Math.floor(box.y * height),
          maxX: Math.floor((box.x + box.width) * width),
          maxY: Math.floor((box.y + box.height) * height)
        };
        // Clamp
        rawBox.maxX = Math.min(width - 1, rawBox.maxX);
        rawBox.maxY = Math.min(height - 1, rawBox.maxY);

        const splits = splitBox(rawBox, data, width, height, bgR, bgG, bgB, effectiveThreshold);
        finalBoxes = [...finalBoxes, ...splits];
      }

      resolve(finalBoxes);
    };
    img.onerror = reject;
  });
};

export const generateSlices = async (
  imageSrc: string,
  slices: BoundingBox[],
  config: ExportConfig
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      const results: string[] = [];
      const tempCanvas = document.createElement("canvas");
      const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) return;

      // Get background color from top-left for transparency logic
      tempCanvas.width = 1;
      tempCanvas.height = 1;
      ctx.drawImage(img, 0, 0);
      const bgPixel = ctx.getImageData(0, 0, 1, 1).data;
      const [bgR, bgG, bgB] = [bgPixel[0], bgPixel[1], bgPixel[2]];

      slices.forEach((slice) => {
        // Calculate pixel dimensions with rigorous rounding
        const rawX = Math.round(slice.x * img.width);
        const rawY = Math.round(slice.y * img.height);
        const rawW = Math.round(slice.width * img.width);
        const rawH = Math.round(slice.height * img.height);

        // Apply Padding
        const padding = config.padding;
        // Ensure we don't go out of bounds due to padding
        const srcX = Math.max(0, rawX - padding);
        const srcY = Math.max(0, rawY - padding);
        // Ensure width doesn't exceed image right edge
        const srcW = Math.min(img.width - srcX, rawW + (padding * 2));
        const srcH = Math.min(img.height - srcY, rawH + (padding * 2));

        if (srcW <= 0 || srcH <= 0) return;

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = srcW;
        sliceCanvas.height = srcH;
        const sliceCtx = sliceCanvas.getContext("2d");

        if (!sliceCtx) return;

        sliceCtx.drawImage(
          img,
          srcX,
          srcY,
          srcW,
          srcH,
          0,
          0,
          srcW,
          srcH
        );

        // Apply Transparency if requested
        if (config.removeBackground) {
          const imageData = sliceCtx.getImageData(0, 0, srcW, srcH);
          const data = imageData.data;
          const threshold = 25; // Sensitivity for transparency

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (colorDistance(r, g, b, bgR, bgG, bgB) < threshold) {
              data[i + 3] = 0; // Set Alpha to 0
            }
          }
          sliceCtx.putImageData(imageData, 0, 0);
        }

        results.push(sliceCanvas.toDataURL(`image/${config.fileFormat}`));
      });

      resolve(results);
    };
    img.onerror = reject;
  });
};

export const generateGridSlices = (rows: number, cols: number): BoundingBox[] => {
  const slices: BoundingBox[] = [];
  const width = 1 / cols;
  const height = 1 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slices.push({
        id: `grid-${r}-${c}`,
        x: c * width,
        y: r * height,
        width: width,
        height: height,
      });
    }
  }
  return slices;
};