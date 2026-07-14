export type PreparedImage = {
  dataUrl: string;
  width: number;
  height: number;
};

type PercentBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MAX_SOURCE_FILE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const MAX_CROP_DIMENSION = 1200;
const MAX_IMAGE_DATA_URL_LENGTH = 4_000_000;
const JPEG_QUALITY = 0.82;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read this photo."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image format is not supported by your browser."));
    image.src = source;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    throw new Error("This photo is still too large after resizing. Try a smaller image.");
  }

  return dataUrl;
}

export function renderImageToJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvas: HTMLCanvasElement,
): PreparedImage {
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the image for analysis.");
  }

  context.fillStyle = "#0c0a09";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  return { dataUrl: canvasToJpeg(canvas), width, height };
}

export async function prepareUploadedImage(file: File): Promise<PreparedImage> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error("Photo is too large. Choose an image smaller than 15 MB.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("Could not determine the photo size.");
  }

  return renderImageToJpeg(
    image,
    image.naturalWidth,
    image.naturalHeight,
    document.createElement("canvas"),
  );
}

export async function cropImageToJpeg(source: string, box: PercentBox): Promise<PreparedImage> {
  const image = await loadImage(source);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("Could not crop this object from the scan.");
  }

  const paddingX = Math.max(2, box.width * 0.15);
  const paddingY = Math.max(2, box.height * 0.15);
  const left = Math.max(0, box.x - paddingX);
  const top = Math.max(0, box.y - paddingY);
  const right = Math.min(100, box.x + box.width + paddingX);
  const bottom = Math.min(100, box.y + box.height + paddingY);

  const sourceX = Math.floor((left / 100) * image.naturalWidth);
  const sourceY = Math.floor((top / 100) * image.naturalHeight);
  const sourceWidth = Math.max(1, Math.ceil(((right - left) / 100) * image.naturalWidth));
  const sourceHeight = Math.max(1, Math.ceil(((bottom - top) / 100) * image.naturalHeight));
  const scale = Math.min(1, MAX_CROP_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;
  if (!context) {
    throw new Error("Could not crop this object from the scan.");
  }

  context.fillStyle = "#0c0a09";
  context.fillRect(0, 0, width, height);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );

  return { dataUrl: canvasToJpeg(canvas), width, height };
}
