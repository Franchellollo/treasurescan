import type { ObjectResult } from "@/components/ObjectResultCard";

export type AnalyzeFrameResult = {
  scene_summary: string;
  objects: ObjectResult[];
  warning: string;
};

export type ScanObject = {
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

export type DetectInterestingObjectsResult = {
  objects: ScanObject[];
};

const baseVisionPrompt = `Analyze this camera frame as an expert assistant for identifying potentially valuable old objects in thrift stores, attics, flea markets, church restorations, and demolition/restoration sites.

Your job is not to be certain. Your job is to help the user decide what deserves attention.

Look for:
- antiques
- religious/church objects
- old furniture
- vintage electronics
- musical instruments
- old books/papers
- collectible packaging
- military markings
- maker marks
- unusual craftsmanship
- historical signs

Do not overstate certainty.
Be cautious with value estimates.
If the image is unclear, say what should be photographed next.
Return only valid JSON.`;

const detectionPrompt = `Analyze this flea-market, thrift-store, shelf, table, attic, or restoration-site image.

Detect only potentially interesting objects. Do not list every visible object.

Interesting examples include:
- vintage electronics
- speakers
- cameras
- tools
- watches
- ceramics
- glassware
- old toys
- musical equipment
- branded items
- unusual design objects
- antique-looking items

Return max 5 objects.
Bounding box coordinates must be percentages from 0 to 100.
x and y are the top-left corner.
width and height are the box size.
If no interesting objects are found, return {"objects":[]}.
Return only valid JSON.`;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    scene_summary: { type: "string" },
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          object_name: { type: "string" },
          likely_category: { type: "string" },
          estimated_period: { type: "string" },
          historical_context: { type: "string" },
          collector_interest: { type: "string", enum: ["low", "medium", "high"] },
          estimated_value_range: { type: "string" },
          worth_score: { type: "number", minimum: 0, maximum: 100 },
          indicator_color: { type: "string", enum: ["green", "yellow", "orange", "red"] },
          confidence_score: { type: "number", minimum: 0, maximum: 100 },
          what_to_photograph_next: {
            type: "array",
            items: { type: "string" },
          },
          recommendation: { type: "string", enum: ["IGNORE", "CHECK", "SAVE", "EXPERT"] },
          reasoning_summary: { type: "string" },
        },
        required: [
          "object_name",
          "likely_category",
          "estimated_period",
          "historical_context",
          "collector_interest",
          "estimated_value_range",
          "worth_score",
          "indicator_color",
          "confidence_score",
          "what_to_photograph_next",
          "recommendation",
          "reasoning_summary",
        ],
      },
    },
    warning: { type: "string" },
  },
  required: ["scene_summary", "objects", "warning"],
} as const;

const detectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    objects: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
          box: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "number", minimum: 0, maximum: 100 },
              y: { type: "number", minimum: 0, maximum: 100 },
              width: { type: "number", minimum: 0, maximum: 100 },
              height: { type: "number", minimum: 0, maximum: 100 },
            },
            required: ["x", "y", "width", "height"],
          },
        },
        required: ["label", "confidence", "reason", "box"],
      },
    },
  },
  required: ["objects"],
} as const;

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const outputText = (payload as { output_text?: unknown }).output_text;
  if (typeof outputText === "string") return outputText;

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }

  return "";
}

function normalizeByScore(object: ObjectResult): ObjectResult {
  const worthScore = Math.max(0, Math.min(100, Number(object.worth_score) || 0));
  const confidenceScore = Math.max(0, Math.min(100, Number(object.confidence_score) || 0));

  let indicator_color: ObjectResult["indicator_color"] = "red";
  let recommendation: ObjectResult["recommendation"] = "IGNORE";

  if (worthScore >= 80) {
    indicator_color = "green";
    recommendation = object.recommendation === "EXPERT" ? "EXPERT" : "SAVE";
  } else if (worthScore >= 50) {
    indicator_color = "yellow";
    recommendation = "CHECK";
  } else if (worthScore >= 25) {
    indicator_color = "orange";
    recommendation = object.recommendation === "IGNORE" ? "IGNORE" : "CHECK";
  }

  return {
    ...object,
    worth_score: worthScore,
    confidence_score: confidenceScore,
    indicator_color,
    recommendation,
    what_to_photograph_next: Array.isArray(object.what_to_photograph_next)
      ? object.what_to_photograph_next
      : [],
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeScanObject(object: ScanObject): ScanObject {
  const x = clampPercent(object.box?.x);
  const y = clampPercent(object.box?.y);
  const width = Math.min(clampPercent(object.box?.width), 100 - x);
  const height = Math.min(clampPercent(object.box?.height), 100 - y);

  return {
    label: object.label || "interesting object",
    confidence: Math.max(0, Math.min(1, Number(object.confidence) || 0)),
    reason: object.reason || "This object may be worth checking more closely.",
    box: { x, y, width, height },
  };
}

async function callOpenAIJson({
  imageBase64,
  prompt,
  schemaName,
  schema,
}: {
  imageBase64: string;
  prompt: string;
  schemaName: string;
  schema: object;
}): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageBase64 },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? (payload as { error?: { message?: string } }).error?.message
        : "";
    throw new Error(message || "OpenAI vision analysis failed.");
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI returned an empty analysis.");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("OpenAI returned a response that was not valid JSON.");
  }
}

export async function analyzeFrameWithOpenAI(
  imageBase64: string,
  objectContext?: string,
): Promise<AnalyzeFrameResult> {
  const contextPrompt = objectContext
    ? `${baseVisionPrompt}

Focus especially on this selected object: ${objectContext}.
If other objects are visible, mention them only when they help identify or value the selected item.`
    : baseVisionPrompt;

  const parsed = (await callOpenAIJson({
    imageBase64,
    prompt: contextPrompt,
    schemaName: "treasurescan_analysis",
    schema: responseSchema,
  })) as AnalyzeFrameResult;

  return {
    scene_summary: parsed.scene_summary || "",
    objects: Array.isArray(parsed.objects) ? parsed.objects.map(normalizeByScore) : [],
    warning: parsed.warning || "",
  };
}

export async function detectInterestingObjectsWithOpenAI(
  imageBase64: string,
): Promise<DetectInterestingObjectsResult> {
  const parsed = (await callOpenAIJson({
    imageBase64,
    prompt: detectionPrompt,
    schemaName: "treasurescan_object_detection",
    schema: detectionSchema,
  })) as DetectInterestingObjectsResult;

  return {
    objects: Array.isArray(parsed.objects)
      ? parsed.objects.slice(0, 5).map(normalizeScanObject).filter((object) => object.box.width > 0 && object.box.height > 0)
      : [],
  };
}
