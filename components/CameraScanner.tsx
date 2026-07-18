"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { cropImageToJpeg, prepareUploadedImage, renderImageToJpeg } from "@/lib/client-image";
import { ItemDeepDive } from "./ItemDeepDive";
import { formatEurRange, ObjectResultCard } from "./ObjectResultCard";
import type { EurValueRange, ObjectResult } from "./ObjectResultCard";

type AnalyzeResponse = {
  scene_summary: string;
  objects: ObjectResult[];
  total_estimated_value_eur: EurValueRange;
  warning: string;
};

type ScanPhase = "idle" | "preparing" | "ready" | "analyzing" | "complete" | "error";

type SelectedItem = {
  item: ObjectResult;
  itemNumber: number;
  image: string;
  imageLabel: string;
};

const emptyResponse: AnalyzeResponse = {
  scene_summary: "",
  objects: [],
  total_estimated_value_eur: { min: 0, max: 0 },
  warning: "",
};

const ANALYSIS_TIMEOUT_MS = 45_000;

function parseEurRange(value: unknown): EurValueRange {
  if (!value || typeof value !== "object") return { min: 0, max: 0 };

  const min = Number((value as { min?: unknown }).min);
  const max = Number((value as { max?: unknown }).max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
    return { min: 0, max: 0 };
  }

  return {
    min: Math.round(Math.min(min, max)),
    max: Math.round(Math.max(min, max)),
  };
}

export function CameraScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestIdRef = useRef(0);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const deepDiveRef = useRef<HTMLDivElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedImage, setCapturedImage] = useState("");
  const [imageDimensions, setImageDimensions] = useState({ width: 4, height: 3 });
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [analysis, setAnalysis] = useState<AnalyzeResponse>(emptyResponse);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    cameraRequestIdRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraReady(false);
      setCameraError("Camera is not available in this browser. Upload a photo instead.");
      return;
    }

    const requestId = cameraRequestIdRef.current + 1;
    cameraRequestIdRef.current = requestId;
    setCameraReady(false);
    setCameraError("");
    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (cameraRequestIdRef.current !== requestId || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      if (cameraRequestIdRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setCameraReady(true);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) streamRef.current = null;
      if (cameraRequestIdRef.current === requestId) {
        setCameraReady(false);
        setCameraError("Camera permission failed. Upload a photo instead.");
      }
    }
  }, []);

  useEffect(() => {
    if (capturedImage) return;

    const frame = window.requestAnimationFrame(() => void startCamera());
    return () => window.cancelAnimationFrame(frame);
  }, [capturedImage, startCamera]);

  useEffect(() => () => {
    analysisAbortRef.current?.abort();
    stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (phase !== "complete") return;

    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      resultsRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      resultsRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (!selectedItem) return;

    const frame = window.requestAnimationFrame(() => {
      deepDiveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedItem]);

  async function analyzeImage(imageBase64: string) {
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    let timedOut = false;

    setPhase("analyzing");
    setError("");
    setAnalysis(emptyResponse);
    setSelectedItem(null);

    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ANALYSIS_TIMEOUT_MS);

    try {
      const response = await fetch("/api/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
        signal: controller.signal,
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error || "")
            : "";
        throw new Error(message || "Analysis failed.");
      }

      if (!payload || typeof payload !== "object") {
        throw new Error("Analysis returned an unexpected response.");
      }

      const result = payload as Partial<AnalyzeResponse>;
      setAnalysis({
        scene_summary: typeof result.scene_summary === "string" ? result.scene_summary : "",
        objects: Array.isArray(result.objects) ? result.objects : [],
        total_estimated_value_eur: parseEurRange(result.total_estimated_value_eur),
        warning: typeof result.warning === "string" ? result.warning : "",
      });
      setPhase("complete");
    } catch (caughtError) {
      const wasAborted = caughtError instanceof Error && caughtError.name === "AbortError";
      if (wasAborted && !timedOut) return;

      setError(
        timedOut
          ? "Analysis took too long. Try again or take another photo."
          : caughtError instanceof Error
            ? caughtError.message
            : "Analysis failed.",
      );
      setPhase("error");
    } finally {
      window.clearTimeout(timeout);
      if (analysisAbortRef.current === controller) {
        analysisAbortRef.current = null;
      }
    }
  }

  async function handleAnalyzeFrame() {
    if (phase === "analyzing" || phase === "preparing") return;

    if (capturedImage) {
      await analyzeImage(capturedImage);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !cameraReady) {
      setError("Camera is not ready yet. Try again or upload a photo.");
      return;
    }

    if (!video.videoWidth || !video.videoHeight) {
      setError("Could not capture a clear frame. Try uploading a photo.");
      return;
    }

    try {
      const prepared = renderImageToJpeg(
        video,
        video.videoWidth,
        video.videoHeight,
        canvas,
      );
      stopCamera();
      setCapturedImage(prepared.dataUrl);
      setImageDimensions({ width: prepared.width, height: prepared.height });
      await analyzeImage(prepared.dataUrl);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not capture this photo.");
      setPhase("error");
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const shouldRestartCamera = Boolean(streamRef.current);
    stopCamera();
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    setCapturedImage("");
    setAnalysis(emptyResponse);
    setSelectedItem(null);
    setError("");
    setPhase("preparing");

    try {
      const prepared = await prepareUploadedImage(file);
      setCapturedImage(prepared.dataUrl);
      setImageDimensions({ width: prepared.width, height: prepared.height });
      setPhase("ready");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not prepare this photo.");
      setPhase("idle");
      if (shouldRestartCamera) void startCamera();
    } finally {
      input.value = "";
    }
  }

  function handleBackToCamera() {
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    stopCamera();
    setCapturedImage("");
    setImageDimensions({ width: 4, height: 3 });
    setAnalysis(emptyResponse);
    setSelectedItem(null);
    setError("");
    setPhase("idle");
  }

  function handleMarkerClick(itemNumber: number) {
    document
      .getElementById(`treasure-result-${itemNumber}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleAnalyzeFurther(item: ObjectResult, itemNumber: number) {
    let image = capturedImage;
    let imageLabel = "Full scan frame";

    if (capturedImage && item.box) {
      try {
        const crop = await cropImageToJpeg(capturedImage, item.box);
        image = crop.dataUrl;
        imageLabel = "Automatic scan crop";
      } catch {
        image = capturedImage;
      }
    }

    setSelectedItem({ item, itemNumber, image, imageLabel });
  }

  function handleCloseDeepDive() {
    const itemNumber = selectedItem?.itemNumber;
    setSelectedItem(null);

    if (itemNumber) {
      window.requestAnimationFrame(() => handleMarkerClick(itemNumber));
    }
  }

  const isBusy = phase === "preparing" || phase === "analyzing";
  const canAnalyze = Boolean(capturedImage) || cameraReady;
  const itemCount = analysis.objects.length;
  const itemLabel = itemCount === 1 ? "item" : "items";
  const capturedImageStyle = {
    aspectRatio: `${imageDimensions.width} / ${imageDimensions.height}`,
  };

  const analyzeButtonText =
    phase === "preparing"
      ? "Preparing photo..."
      : phase === "analyzing"
        ? "Analyzing..."
        : phase === "error"
          ? "Try again"
          : capturedImage
            ? "Analyze photo"
            : "Analyze frame";

  return (
    <section className="grid gap-5">
      <div className="overflow-hidden rounded-lg border border-stone-700/70 bg-black shadow-2xl shadow-black/35">
        {capturedImage ? (
          <div className="flex w-full justify-center bg-black">
            <div className="relative w-full overflow-hidden" style={capturedImageStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capturedImage}
                alt="Captured frame being analyzed"
                className="absolute inset-0 h-full w-full object-contain"
              />

              {phase === "complete" && selectedItem?.item.box ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-amber-300 shadow-[0_0_0_1px_rgba(12,10,9,0.9)]"
                  style={{
                    left: `${selectedItem.item.box.x}%`,
                    top: `${selectedItem.item.box.y}%`,
                    width: `${selectedItem.item.box.width}%`,
                    height: `${selectedItem.item.box.height}%`,
                  }}
                />
              ) : null}

              {phase === "complete"
                ? analysis.objects.map((object, index) => {
                    if (!object.marker) return null;
                    const itemNumber = index + 1;

                    return (
                      <button
                        key={`${object.object_name}-${itemNumber}`}
                        type="button"
                        onClick={() => handleMarkerClick(itemNumber)}
                        aria-label={`View item ${itemNumber}: ${object.object_name}`}
                        title={object.object_name}
                        className="absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-stone-950 bg-amber-300 text-sm font-black text-stone-950 shadow-[0_2px_16px_rgba(0,0,0,0.75)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-100"
                        style={{ left: `${object.marker.x}%`, top: `${object.marker.y}%` }}
                      >
                        {itemNumber}
                      </button>
                    );
                  })
                : null}
            </div>
          </div>
        ) : (
          <div className="relative aspect-[3/4] w-full sm:aspect-video">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {!cameraReady && !cameraError && phase !== "preparing" ? (
              <div className="absolute inset-0 grid place-items-center bg-stone-950 text-center">
                <div className="px-6">
                  <p className="text-sm font-semibold text-stone-200">Opening camera...</p>
                  <p className="mt-2 text-sm text-stone-500">
                    Rear camera is preferred when your device supports it.
                  </p>
                </div>
              </div>
            ) : null}

            {cameraError && phase !== "preparing" ? (
              <div className="absolute inset-0 grid place-items-center bg-stone-950 text-center">
                <p className="max-w-sm px-6 text-sm text-stone-400">Camera unavailable</p>
              </div>
            ) : null}

            {phase === "preparing" ? (
              <div className="absolute inset-0 grid place-items-center bg-stone-950/90 text-center">
                <div className="px-6">
                  <span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-stone-700 border-t-amber-300" />
                  <p className="mt-3 text-sm font-semibold text-stone-200">Preparing photo...</p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="border-t border-stone-800 bg-stone-950/94 p-4">
          {capturedImage ? (
            <div
              role="status"
              aria-live="polite"
              className="mb-3 rounded-md border border-stone-700 bg-stone-900/80 p-3"
            >
              {phase === "ready" ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  Photo ready
                </div>
              ) : null}

              {phase === "analyzing" ? (
                <div className="grid gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    Photo captured
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-600 border-t-amber-300" />
                    Analyzing objects...
                  </div>
                </div>
              ) : null}

              {phase === "complete" ? (
                <div className="grid gap-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    Analysis complete
                  </div>
                  <p className="pl-[18px] text-sm text-stone-400">
                    {itemCount} {itemLabel} found
                  </p>
                </div>
              ) : null}

              {phase === "error" ? (
                <div className="grid gap-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-100">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                    Analysis failed
                  </div>
                  <p className="pl-[18px] text-sm text-stone-400">The captured photo is still available.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {cameraError && !capturedImage ? (
            <p className="mb-3 rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              {cameraError}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mb-3 rounded-md border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            {phase !== "complete" ? (
              <button
                type="button"
                onClick={handleAnalyzeFrame}
                disabled={isBusy || !canAnalyze}
                className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-bold text-stone-950 transition ${
                  phase === "analyzing"
                    ? "cursor-wait bg-amber-300/70"
                    : "bg-amber-300 hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                }`}
              >
                {phase === "analyzing" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-700/40 border-t-stone-950" />
                ) : null}
                {analyzeButtonText}
              </button>
            ) : null}

            {capturedImage ? (
              <button
                type="button"
                onClick={handleBackToCamera}
                className="h-12 flex-1 rounded-md border border-stone-700 px-4 text-sm font-semibold text-stone-100 transition hover:border-stone-500 hover:bg-stone-900"
              >
                Back to camera
              </button>
            ) : (
              <label
                className={`flex h-12 flex-1 cursor-pointer items-center justify-center rounded-md border border-stone-700 px-4 text-sm font-semibold text-stone-100 transition hover:border-stone-500 hover:bg-stone-900 ${
                  phase === "preparing" ? "pointer-events-none opacity-50" : ""
                }`}
              >
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={phase === "preparing"}
                  onChange={handleFileUpload}
                />
              </label>
            )}
          </div>
        </div>
      </div>

      {phase === "complete" ? (
        <div
          ref={resultsRef}
          tabIndex={-1}
          className="grid scroll-mt-4 gap-4 outline-none"
        >
          <div className="rounded-lg border border-stone-700/70 bg-stone-950/58 p-4">
            {analysis.objects.length > 0 ? (
              <div className="border-b border-stone-800 pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Estimated visible resale value
                </p>
                <p className="mt-2 text-2xl font-semibold text-amber-100">
                  {formatEurRange(analysis.total_estimated_value_eur)}
                </p>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  Provisional total for {itemCount} unique {itemLabel}. Not a professional appraisal.
                </p>
              </div>
            ) : null}
            <p
              className={`text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 ${
                analysis.objects.length > 0 ? "mt-4" : ""
              }`}
            >
              Scene summary
            </p>
            <p className="mt-2 leading-6 text-stone-200">
              {analysis.scene_summary || "No summary returned."}
            </p>
            {analysis.warning ? (
              <p className="mt-3 rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
                {analysis.warning}
              </p>
            ) : null}
          </div>

          {analysis.objects.length > 0 ? (
            analysis.objects.map((object, index) => (
              <ObjectResultCard
                key={`${object.object_name}-${index}`}
                result={object}
                itemNumber={index + 1}
                onAnalyzeFurther={() => handleAnalyzeFurther(object, index + 1)}
              />
            ))
          ) : (
            <div className="rounded-lg border border-stone-700/70 bg-stone-950/58 p-4">
              <p className="font-semibold text-stone-100">No strong candidates identified</p>
              <p className="mt-2 text-sm leading-6 text-stone-400">
                No strong candidates identified from this distance. Move closer to labels, model numbers,
                signatures or unusual details.
              </p>
            </div>
          )}
        </div>
      ) : phase === "idle" && !error ? (
        <div className="rounded-lg border border-stone-700/70 bg-stone-950/45 p-4 text-sm leading-6 text-stone-400">
          Point the camera at electronics, tools, branded goods, furniture, art, books, historical objects, or
          anything with unusual labels, materials, or design, then analyze the frame.
        </div>
      ) : null}

      {selectedItem ? (
        <div ref={deepDiveRef} className="scroll-mt-4">
          <ItemDeepDive
            key={`${selectedItem.itemNumber}-${selectedItem.imageLabel}`}
            item={selectedItem.item}
            itemNumber={selectedItem.itemNumber}
            initialImage={selectedItem.image}
            initialImageLabel={selectedItem.imageLabel}
            onClose={handleCloseDeepDive}
          />
        </div>
      ) : null}

      <canvas ref={canvasRef} className="hidden" />
    </section>
  );
}
