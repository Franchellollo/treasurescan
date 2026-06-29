"use client";

import { ChangeEvent, useRef, useState } from "react";
import { ObjectResult, ObjectResultCard } from "./ObjectResultCard";

type ScanObject = {
  label: string;
  confidence: number;
  reason: string;
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

type ScanResponse = {
  objects: ScanObject[];
};

type AnalyzeResponse = {
  scene_summary: string;
  objects: ObjectResult[];
  warning?: string;
};

const maxInputBytes = 15 * 1024 * 1024;
const maxImageSide = 1600;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

async function compressImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  if (file.size > maxInputBytes) {
    throw new Error("Image is too large. Choose a smaller photo.");
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const scale = Math.min(1, maxImageSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not prepare image.");
  }

  context.drawImage(image, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    width,
    height,
  };
}

export function ScanMode() {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageBase64, setImageBase64] = useState("");
  const [imageSize, setImageSize] = useState({ width: 4, height: 3 });
  const [objects, setObjects] = useState<ScanObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<ScanObject | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState("");

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setObjects([]);
    setSelectedObject(null);
    setAnalysis(null);
    setHasScanned(false);

    try {
      const compressed = await compressImageFile(file);
      setImageBase64(compressed.dataUrl);
      setImageSize({ width: compressed.width, height: compressed.height });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not prepare image.");
    } finally {
      event.target.value = "";
    }
  }

  async function scanImage() {
    if (!imageBase64) {
      setError("Choose or capture an image first.");
      return;
    }

    setIsScanning(true);
    setError("");
    setObjects([]);
    setSelectedObject(null);
    setAnalysis(null);
    setHasScanned(false);

    try {
      const response = await fetch("/api/detect-objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Scan failed, try another image.");
      }

      const scanResponse = payload as ScanResponse;
      setObjects(Array.isArray(scanResponse.objects) ? scanResponse.objects : []);
      setHasScanned(true);
    } catch {
      setError("Scan failed, try another image.");
    } finally {
      setIsScanning(false);
    }
  }

  async function cropSelectedObject(object: ScanObject): Promise<string> {
    const image = imageRef.current;
    if (!image) return imageBase64;

    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const x = Math.round((object.box.x / 100) * sourceWidth);
    const y = Math.round((object.box.y / 100) * sourceHeight);
    const width = Math.max(1, Math.round((object.box.width / 100) * sourceWidth));
    const height = Math.max(1, Math.round((object.box.height / 100) * sourceHeight));

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(width, sourceWidth - x);
    canvas.height = Math.min(height, sourceHeight - y);
    const context = canvas.getContext("2d");

    if (!context) return imageBase64;

    context.drawImage(image, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  }

  async function analyzeSelectedObject() {
    if (!selectedObject) return;

    setIsAnalyzing(true);
    setError("");
    setAnalysis(null);

    try {
      const selectedImage = await cropSelectedObject(selectedObject);
      const response = await fetch("/api/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: selectedImage,
          objectContext: `${selectedObject.label}. Detection reason: ${selectedObject.reason}`,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Analysis failed.");
      }

      setAnalysis(payload as AnalyzeResponse);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <section className="grid gap-5 rounded-lg border border-stone-700/70 bg-stone-950/45 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300/75">
          Scan Mode
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-50">Treasure Scan</h2>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-md bg-amber-300 px-4 text-sm font-bold text-stone-950 transition hover:bg-amber-200">
          Capture or upload photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handleImageChange}
          />
        </label>
        <button
          type="button"
          onClick={scanImage}
          disabled={!imageBase64 || isScanning}
          className="h-12 rounded-md border border-stone-700 px-4 text-sm font-semibold text-stone-100 transition hover:border-stone-500 hover:bg-stone-900 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-500"
        >
          {isScanning ? "Scanning image..." : "Scan image"}
        </button>
      </div>

      {imageBase64 ? (
        <div
          className="relative overflow-hidden rounded-lg border border-stone-700 bg-black"
          style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={imageBase64}
            alt="Treasure scan upload"
            className="absolute inset-0 h-full w-full object-fill"
          />

          {objects.map((object, index) => {
            const active = selectedObject === object;
            return (
              <button
                key={`${object.label}-${index}`}
                type="button"
                onClick={() => {
                  setSelectedObject(object);
                  setAnalysis(null);
                }}
                className={`absolute rounded-md border-2 text-left shadow-[0_0_22px_rgba(251,191,36,0.25)] transition ${
                  active
                    ? "border-emerald-300 bg-emerald-300/20"
                    : "border-amber-300 bg-amber-300/10 hover:bg-amber-300/20"
                }`}
                style={{
                  left: `${object.box.x}%`,
                  top: `${object.box.y}%`,
                  width: `${object.box.width}%`,
                  height: `${object.box.height}%`,
                }}
                aria-label={`Select ${object.label}`}
              >
                <span className="absolute left-1 top-1 max-w-[calc(100%-0.5rem)] rounded bg-stone-950/85 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-stone-50">
                  {object.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-stone-700 p-6 text-center text-sm text-stone-400">
          Capture a flea-market table, shelf, or box of objects to find promising items.
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {!isScanning && hasScanned && imageBase64 && objects.length === 0 && !error ? (
        <div className="rounded-lg border border-stone-700/70 bg-stone-950/58 p-4 text-sm text-stone-400">
          No interesting objects found
        </div>
      ) : null}

      {selectedObject ? (
        <div className="rounded-lg border border-stone-700/70 bg-stone-950/68 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-stone-50">{selectedObject.label}</h3>
              <p className="mt-1 text-sm text-stone-500">
                Confidence {Math.round(selectedObject.confidence * 100)}%
              </p>
            </div>
            <button
              type="button"
              onClick={analyzeSelectedObject}
              disabled={isAnalyzing}
              className="h-11 rounded-md bg-amber-300 px-4 text-sm font-bold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
            >
              {isAnalyzing ? "Analyzing item..." : "Analyze this item"}
            </button>
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-300">{selectedObject.reason}</p>
        </div>
      ) : null}

      {analysis ? (
        <div className="grid gap-4">
          <div className="rounded-lg border border-stone-700/70 bg-stone-950/58 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Selected item analysis
            </p>
            <p className="mt-2 leading-6 text-stone-200">{analysis.scene_summary || "No summary returned."}</p>
            {analysis.warning ? (
              <p className="mt-3 rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                {analysis.warning}
              </p>
            ) : null}
          </div>

          {analysis.objects.map((object, index) => (
            <ObjectResultCard key={`${object.object_name}-${index}`} result={object} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
