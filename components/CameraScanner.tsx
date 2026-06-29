"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ObjectResult, ObjectResultCard } from "./ObjectResultCard";

type AnalyzeResponse = {
  scene_summary: string;
  objects: ObjectResult[];
  warning?: string;
};

const emptyResponse: AnalyzeResponse = {
  scene_summary: "",
  objects: [],
  warning: "",
};

export function CameraScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResponse>(emptyResponse);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera is not available in this browser.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        if (mounted) {
          setCameraError("Camera permission failed. Upload a photo instead.");
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function analyzeImage(imageBase64: string) {
    setIsAnalyzing(true);
    setError("");
    setAnalysis(emptyResponse);

    try {
      const response = await fetch("/api/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Analysis failed.");
      }

      setAnalysis(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleAnalyzeFrame() {
    if (uploadedImage) {
      await analyzeImage(uploadedImage);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !cameraReady) {
      setError("Camera is not ready yet. Try again or upload a photo.");
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      setError("Could not capture a clear frame. Try uploading a photo.");
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not prepare the image for analysis.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    await analyzeImage(canvas.toDataURL("image/jpeg", 0.86));
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setUploadedImage(reader.result);
        setCameraError("");
        setError("");
      }
    };
    reader.readAsDataURL(file);
  }

  const hasResults = analysis.objects.length > 0 || analysis.scene_summary || analysis.warning;

  return (
    <section className="grid gap-5">
      <div className="overflow-hidden rounded-lg border border-stone-700/70 bg-black shadow-2xl shadow-black/35">
        <div className="relative aspect-[3/4] max-h-[72dvh] min-h-[420px] w-full sm:aspect-video sm:min-h-0">
          {uploadedImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadedImage} alt="Uploaded object frame" className="h-full w-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />
          )}

          {!cameraReady && !uploadedImage ? (
            <div className="absolute inset-0 grid place-items-center bg-stone-950 text-center">
              <div className="px-6">
                <p className="text-sm font-semibold text-stone-200">Opening camera...</p>
                <p className="mt-2 text-sm text-stone-500">
                  Rear camera is preferred when your device supports it.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-stone-800 bg-stone-950/94 p-4">
          {cameraError ? (
            <p className="mb-3 rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-100">
              {cameraError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleAnalyzeFrame}
              disabled={isAnalyzing || (!cameraReady && !uploadedImage)}
              className="h-12 flex-1 rounded-md bg-amber-300 px-4 text-sm font-bold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
            >
              {isAnalyzing ? "Analyzing frame..." : "Analyze frame"}
            </button>

            <label className="flex h-12 cursor-pointer items-center justify-center rounded-md border border-stone-700 px-4 text-sm font-semibold text-stone-100 transition hover:border-stone-500 hover:bg-stone-900">
              Upload photo
              <input type="file" accept="image/*" className="sr-only" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {hasResults ? (
        <div className="grid gap-4">
          <div className="rounded-lg border border-stone-700/70 bg-stone-950/58 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Scene summary
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
      ) : (
        <div className="rounded-lg border border-stone-700/70 bg-stone-950/45 p-4 text-sm leading-6 text-stone-400">
          Point the camera at furniture, books, tools, church objects, packaging, instruments, or anything with
          unusual markings, then analyze the frame.
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </section>
  );
}
