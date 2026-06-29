import { NextRequest, NextResponse } from "next/server";
import { detectInterestingObjectsWithOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

type DetectObjectsRequest = {
  imageBase64?: unknown;
};

function isValidImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(value);
}

function isReasonableImageSize(value: string): boolean {
  return value.length <= 7_000_000;
}

export async function POST(request: NextRequest) {
  let body: DetectObjectsRequest;

  try {
    body = (await request.json()) as DetectObjectsRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isValidImageDataUrl(body.imageBase64)) {
    return NextResponse.json(
      { error: "imageBase64 is required and must be a base64 image data URL." },
      { status: 400 },
    );
  }

  if (!isReasonableImageSize(body.imageBase64)) {
    return NextResponse.json(
      { error: "Image is too large. Use a smaller or compressed image." },
      { status: 413 },
    );
  }

  try {
    const result = await detectInterestingObjectsWithOpenAI(body.imageBase64);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed, try another image.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
