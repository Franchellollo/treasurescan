import { NextRequest, NextResponse } from "next/server";
import { analyzeFrameWithOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 4_100_000;
const MAX_IMAGE_DATA_URL_LENGTH = 4_000_000;

type AnalyzeFrameRequest = {
  imageBase64?: unknown;
};

function isValidImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(value);
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "Image is too large. Upload a smaller photo." },
      { status: 413 },
    );
  }

  let body: AnalyzeFrameRequest;

  try {
    body = (await request.json()) as AnalyzeFrameRequest;
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

  try {
    const result = await analyzeFrameWithOpenAI(body.imageBase64);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not analyze the frame.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
