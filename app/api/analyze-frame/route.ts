import { NextRequest, NextResponse } from "next/server";
import { analyzeFrameWithOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

type AnalyzeFrameRequest = {
  imageBase64?: unknown;
};

function isValidImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(value);
}

export async function POST(request: NextRequest) {
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

  try {
    const result = await analyzeFrameWithOpenAI(body.imageBase64);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not analyze the frame.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
