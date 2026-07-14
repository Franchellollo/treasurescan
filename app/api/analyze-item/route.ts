import { NextRequest, NextResponse } from "next/server";
import {
  analyzeItemWithOpenAI,
  type ItemAnalysisContext,
} from "@/lib/openai";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 4_110_000;
const MAX_IMAGE_DATA_URL_LENGTH = 4_000_000;

type AnalyzeItemRequest = {
  imageBase64?: unknown;
  objectContext?: unknown;
};

function isValidImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(value);
}

function limitedString(value: unknown, fallback = "unknown"): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 160)
    : fallback;
}

function parseContext(value: unknown): ItemAnalysisContext | null {
  if (!value || typeof value !== "object") return null;

  const context = value as Record<string, unknown>;
  const objectName = limitedString(context.object_name, "");
  const category = limitedString(context.likely_category, "");
  const range = context.estimated_value_eur;
  if (!objectName || !category || !range || typeof range !== "object") return null;

  const min = Number((range as Record<string, unknown>).min);
  const max = Number((range as Record<string, unknown>).max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) return null;

  const valuationBasis: ItemAnalysisContext["valuation_basis"] =
    context.valuation_basis === "MODEL_ESTIMATE" || context.valuation_basis === "BRAND_ESTIMATE"
      ? context.valuation_basis
      : "CATEGORY_ESTIMATE";

  return {
    object_name: objectName,
    likely_category: category,
    estimated_period: limitedString(context.estimated_period),
    estimated_value_eur: {
      min: Math.round(Math.min(min, max)),
      max: Math.round(Math.max(min, max)),
    },
    valuation_basis: valuationBasis,
  };
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "Image is too large. Upload a smaller photo." },
      { status: 413 },
    );
  }

  let body: AnalyzeItemRequest;

  try {
    body = (await request.json()) as AnalyzeItemRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isValidImageDataUrl(body.imageBase64)) {
    return NextResponse.json(
      { error: "imageBase64 is required and must be a base64 image data URL." },
      { status: 400 },
    );
  }

  if (body.imageBase64.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return NextResponse.json(
      { error: "Image is too large. Upload a smaller photo." },
      { status: 413 },
    );
  }

  const objectContext = parseContext(body.objectContext);
  if (!objectContext) {
    return NextResponse.json(
      { error: "A valid selected object context is required." },
      { status: 400 },
    );
  }

  try {
    const result = await analyzeItemWithOpenAI(body.imageBase64, objectContext);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not analyze this item.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
