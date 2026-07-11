const MAX_DATA_URL_CHARS = 120_000;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 400;

export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export async function fileToAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await loadAvatarBitmap(file);
  try {
    const canvas = renderAvatarCanvas(bitmap);
    let quality = 0.9;
    let blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > MAX_DATA_URL_CHARS && quality > 0.4) {
      quality -= 0.08;
      blob = await canvasToJpegBlob(canvas, quality);
    }
    if (blob.size > MAX_DATA_URL_CHARS) {
      throw new Error('compress-failed');
    }
    return blob;
  } finally {
    if ('close' in bitmap && typeof bitmap.close === 'function') {
      bitmap.close();
    }
  }
}

export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const blob = await fileToAvatarBlob(file);
  return blobToDataUrl(blob);
}

async function loadAvatarBitmap(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if (!file.type.startsWith('image/')) {
    throw new Error('invalid-type');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('too-large');
  }
  return loadImage(file);
}

function renderAvatarCanvas(bitmap: HTMLImageElement | ImageBitmap): HTMLCanvasElement {
  let width = bitmap.width;
  let height = bitmap.height;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      height = Math.max(1, Math.round((height * MAX_DIMENSION) / width));
      width = MAX_DIMENSION;
    } else {
      width = Math.max(1, Math.round((width * MAX_DIMENSION) / height));
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('compress-failed'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('compress-failed'));
    };
    reader.onerror = () => reject(new Error('compress-failed'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load-failed'));
    };
    img.src = url;
  });
}
