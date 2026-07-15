"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { prepareUploadedImage } from "@/lib/client-image";
import type { ItemAnalysisResult } from "@/lib/openai";
import { formatEurRange } from "./ObjectResultCard";
import type { ObjectResult } from "./ObjectResultCard";

type ItemDeepDiveProps = {
  item: ObjectResult;
  itemNumber: number;
  initialImage: string;
  initialImageLabel: string;
  onClose: () => void;
};

type ItemPhase = "ready" | "preparing" | "analyzing" | "complete" | "error";

const ANALYSIS_TIMEOUT_MS = 45_000;

const recommendationClasses: Record<ItemAnalysisResult["recommendation"], string> = {
  IGNORE: "border-red-400/25 bg-red-500/10 text-red-100",
  CHECK: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
  SAVE: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  EXPERT: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
};

const valuationBasisLabels: Record<ItemAnalysisResult["valuation_basis"], string> = {
  MODEL_ESTIMATE: "Model estimate",
  BRAND_ESTIMATE: "Brand estimate",
  CATEGORY_ESTIMATE: "Category estimate",
};

export function ItemDeepDive({
  item,
  itemNumber,
  initialImage,
  initialImageLabel,
  onClose,
}: ItemDeepDiveProps) {
  const abortRef = useRef<AbortController | null>(null);
  const [sourceImage, setSourceImage] = useState(initialImage);
  const [sourceLabel, setSourceLabel] = useState(initialImageLabel);
  const [phase, setPhase] = useState<ItemPhase>("ready");
  const [analysis, setAnalysis] = useState<ItemAnalysisResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleAnalyzeItem() {
    if (phase === "analyzing" || phase === "preparing") return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    setPhase("analyzing");
    setAnalysis(null);
    setError("");

    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ANALYSIS_TIMEOUT_MS);

    try {
      const response = await fetch("/api/analyze-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: sourceImage,
          objectContext: {
            object_name: item.object_name,
            likely_category: item.likely_category,
            estimated_period: item.estimated_period,
            estimated_value_eur: item.estimated_value_eur,
            valuation_basis: item.valuation_basis,
          },
        }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error || "")
            : "";
        throw new Error(message || "Item analysis failed.");
      }

      if (!payload || typeof payload !== "object" || !("estimated_value_eur" in payload)) {
        throw new Error("Item analysis returned an unexpected response.");
      }

      setAnalysis(payload as ItemAnalysisResult);
      setPhase("complete");
    } catch (caughtError) {
      const wasAborted = caughtError instanceof Error && caughtError.name === "AbortError";
      if (wasAborted && !timedOut) return;

      setError(
        timedOut
          ? "Item analysis took too long. Try again."
          : caughtError instanceof Error
            ? caughtError.message
            : "Item analysis failed.",
      );
      setPhase("error");
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function handleCloseupUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    abortRef.current?.abort();
    setPhase("preparing");
    setAnalysis(null);
    setError("");

    try {
      const prepared = await prepareUploadedImage(file);
      setSourceImage(prepared.dataUrl);
      setSourceLabel("Close-up photo");
      setPhase("ready");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not prepare this photo.");
      setPhase("error");
    } finally {
      input.value = "";
    }
  }

  function handleUseScanCrop() {
    abortRef.current?.abort();
    setSourceImage(initialImage);
    setSourceLabel(initialImageLabel);
    setAnalysis(null);
    setError("");
    setPhase("ready");
  }

  const isBusy = phase === "preparing" || phase === "analyzing";

  return (
    <section className="scroll-mt-4 rounded-lg border border-amber-200/20 bg-stone-950/72 p-4 shadow-2xl shadow-black/25 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/75">
            Item deep dive {itemNumber}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-stone-50">{item.object_name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-sm font-semibold text-stone-400 transition hover:text-stone-100"
        >
          Back to results
        </button>
      </div>

      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-md border border-stone-800 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sourceImage}
          alt={`Selected view of ${item.object_name}`}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          {sourceLabel}
        </span>
        {sourceImage !== initialImage ? (
          <button
            type="button"
            onClick={handleUseScanCrop}
            disabled={isBusy}
            className="text-xs font-semibold text-stone-400 transition hover:text-stone-100 disabled:opacity-50"
          >
            Use scan crop
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleAnalyzeItem}
          disabled={isBusy}
          className="flex h-12 items-center justify-center gap-2 rounded-md bg-amber-300 px-4 text-sm font-bold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
        >
          {phase === "analyzing" ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-700/40 border-t-stone-950" />
          ) : null}
          {phase === "analyzing" ? "Analyzing item..." : "Analyze selected item"}
        </button>

        <label
          className={`flex h-12 cursor-pointer items-center justify-center rounded-md border border-stone-700 px-4 text-sm font-semibold text-stone-100 transition hover:border-stone-500 hover:bg-stone-900 ${
            isBusy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {phase === "preparing" ? "Preparing close-up..." : "Capture or upload close-up"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={isBusy}
            onChange={handleCloseupUpload}
          />
        </label>
      </div>

      {analysis ? (
        <div className="mt-6 border-t border-stone-800 pt-5">
          <h3 className="text-xl font-semibold text-stone-50">{analysis.refined_object_name}</h3>
          <p className="mt-2 text-3xl font-semibold text-amber-100">
            {formatEurRange(analysis.estimated_value_eur)}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md border px-2.5 py-1 text-xs font-bold tracking-[0.14em] ${recommendationClasses[analysis.recommendation]}`}
            >
              {analysis.recommendation}
            </span>
            <span className="rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1 text-xs text-stone-300">
              {valuationBasisLabels[analysis.valuation_basis]}
            </span>
            <span className="text-xs text-stone-400">
              Identification {Math.round(analysis.identification_confidence)}/100
            </span>
            <span className="text-xs text-stone-400">
              Pricing confidence {analysis.pricing_confidence}
            </span>
          </div>

          <dl className="mt-5 grid gap-3 border-y border-stone-800 py-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Brand</dt>
              <dd className="mt-1 text-stone-200">{analysis.likely_brand}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Model</dt>
              <dd className="mt-1 text-stone-200">{analysis.likely_model}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Period</dt>
              <dd className="mt-1 text-stone-200">{analysis.estimated_period}</dd>
            </div>
          </dl>

          <div className="mt-4 grid gap-4 text-sm leading-6 text-stone-300">
            <p>{analysis.identification_summary}</p>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Visible condition</p>
              <p className="mt-1">{analysis.visible_condition}</p>
            </div>

            {analysis.value_drivers.length > 0 ? (
              <ResultList title="Value drivers" items={analysis.value_drivers} />
            ) : null}
            {analysis.uncertainties.length > 0 ? (
              <ResultList title="Uncertainties" items={analysis.uncertainties} />
            ) : null}
            {analysis.recommended_checks.length > 0 ? (
              <ResultList title="Checks before resale" items={analysis.recommended_checks} />
            ) : null}

            {analysis.next_photo_suggestion ? (
              <div className="border-t border-stone-800 pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Optional next photo
                </p>
                <p className="mt-1">{analysis.next_photo_suggestion}</p>
              </div>
            ) : null}

            {analysis.warning ? (
              <p className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
                {analysis.warning}
              </p>
            ) : null}

            <p className="text-xs text-stone-500">
              Provisional visual estimate only. Verify condition, markings, and recent sold prices.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
