import type { ObjectResult } from "@/components/ObjectResultCard";

export type AnalyzeFrameResult = {
  scene_summary: string;
  objects: ObjectResult[];
  warning: string;
};

const visionPrompt = `Analyze this camera frame as a discovery scan for objects that may deserve closer inspection in thrift stores, attics, flea markets, church restorations, workshops, and demolition or restoration sites.

Your job is not to prove that an object is valuable. Your job is to identify up to five of the best visible candidates for a closer look.

An object may deserve attention because of:
- resale value
- collectible or historical value
- useful parts value
- a visible brand, model, maker mark, signature, or label
- unusual design, craftsmanship, material, or construction

Consider both modern and older objects, including electronics, audio equipment, cameras, tools, watches, jewelry, ceramics, glassware, art, toys, games, musical equipment, branded goods, furniture, books, papers, packaging, religious or church objects, military or historical objects, and architectural salvage.

Do not require an object to be antique, vintage, rare, old, or collectible. Do not force those descriptions when they are not supported by visible evidence.
For wide scenes, select the five strongest candidates rather than trying to identify everything.
Never invent a brand, model, age, material, authenticity claim, or price detail that cannot be seen.

Candidate status rules:
- INTERESTING: visible details give a concrete reason to inspect, research, save, or seek an expert.
- NEEDS_CLOSEUP: the object may have value, but a label, model number, signature, condition detail, connector, material, or maker mark is unreadable. Prefer this over IGNORE when value is plausible but identification is incomplete.
- IGNORE: the object is identifiable and there is no meaningful reason for closer inspection. Do not use IGNORE merely because an object is modern.

When details are insufficient, keep the object as a candidate, use NEEDS_CLOSEUP, set pricing confidence to low, use a broad generic value range or null, and request a specific close-up photo.
Confidence score means identification confidence. Pricing confidence separately describes how reliable the price estimate is.
Be cautious with value estimates and do not claim an object is valuable when its brand or model is unreadable.
Return an empty objects array only when there are genuinely no identifiable objects worth closer inspection. Do not pad the list with ordinary objects.

For every returned object, place one approximate marker at the visual center of that object.
Marker x and y must be percentages from 0 to 100, measured from the image's top-left corner.
Only include objects that can be located clearly enough to place a marker.
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
          value_context: { type: "string" },
          market_interest: { type: "string", enum: ["low", "medium", "high"] },
          estimated_value_range: { type: ["string", "null"] },
          candidate_status: {
            type: "string",
            enum: ["INTERESTING", "NEEDS_CLOSEUP", "IGNORE"],
          },
          pricing_confidence: { type: "string", enum: ["low", "medium", "high"] },
          worth_score: { type: "number", minimum: 0, maximum: 100 },
          indicator_color: { type: "string", enum: ["green", "yellow", "orange", "red"] },
          confidence_score: { type: "number", minimum: 0, maximum: 100 },
          what_to_photograph_next: {
            type: "array",
            items: { type: "string" },
          },
          recommendation: { type: "string", enum: ["IGNORE", "CHECK", "SAVE", "EXPERT"] },
          reasoning_summary: { type: "string" },
          marker: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "number", minimum: 0, maximum: 100 },
              y: { type: "number", minimum: 0, maximum: 100 },
            },
            required: ["x", "y"],
          },
        },
        required: [
          "object_name",
          "likely_category",
          "estimated_period",
          "value_context",
          "market_interest",
          "estimated_value_range",
          "candidate_status",
          "pricing_confidence",
          "worth_score",
          "indicator_color",
          "confidence_score",
          "what_to_photograph_next",
          "recommendation",
          "reasoning_summary",
          "marker",
        ],
      },
    },
    warning: { type: "string" },
  },
  required: ["scene_summary", "objects", "warning"],
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
  const candidateStatus: ObjectResult["candidate_status"] =
    object.candidate_status === "INTERESTING" ||
    object.candidate_status === "NEEDS_CLOSEUP" ||
    object.candidate_status === "IGNORE"
      ? object.candidate_status
      : "NEEDS_CLOSEUP";
  let pricingConfidence: ObjectResult["pricing_confidence"] =
    object.pricing_confidence === "medium" || object.pricing_confidence === "high"
      ? object.pricing_confidence
      : "low";
  let worthScore = Math.max(0, Math.min(100, Number(object.worth_score) || 0));
  const confidenceScore = Math.max(0, Math.min(100, Number(object.confidence_score) || 0));
  const markerX = Number(object.marker?.x);
  const markerY = Number(object.marker?.y);
  const marker =
    Number.isFinite(markerX) && Number.isFinite(markerY)
      ? {
          x: Math.max(2, Math.min(98, markerX)),
          y: Math.max(2, Math.min(98, markerY)),
        }
      : null;

  let indicator_color: ObjectResult["indicator_color"] = "red";
  let recommendation: ObjectResult["recommendation"] = "IGNORE";

  if (candidateStatus === "IGNORE") {
    worthScore = Math.min(worthScore, 24);
    pricingConfidence = "low";
  } else if (candidateStatus === "NEEDS_CLOSEUP") {
    worthScore = Math.max(25, Math.min(worthScore, 79));
    pricingConfidence = "low";
  } else {
    worthScore = Math.max(25, worthScore);
  }

  if (candidateStatus === "IGNORE") {
    indicator_color = "red";
    recommendation = "IGNORE";
  } else if (worthScore >= 80) {
    indicator_color = "green";
    recommendation = object.recommendation === "EXPERT" ? "EXPERT" : "SAVE";
  } else if (worthScore >= 50) {
    indicator_color = "yellow";
    recommendation = "CHECK";
  } else if (worthScore >= 25) {
    indicator_color = "orange";
    recommendation = "CHECK";
  }

  return {
    ...object,
    candidate_status: candidateStatus,
    pricing_confidence: pricingConfidence,
    estimated_value_range:
      typeof object.estimated_value_range === "string" && object.estimated_value_range.trim()
        ? object.estimated_value_range.trim()
        : null,
    worth_score: worthScore,
    confidence_score: confidenceScore,
    indicator_color,
    recommendation,
    marker,
    what_to_photograph_next: Array.isArray(object.what_to_photograph_next)
      ? object.what_to_photograph_next
      : [],
  };
}

export async function analyzeFrameWithOpenAI(imageBase64: string): Promise<AnalyzeFrameResult> {
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
            { type: "input_text", text: visionPrompt },
            { type: "input_image", image_url: imageBase64 },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "treasurescan_analysis",
          strict: true,
          schema: responseSchema,
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

  let parsed: AnalyzeFrameResult;
  try {
    parsed = JSON.parse(text) as AnalyzeFrameResult;
  } catch {
    throw new Error("OpenAI returned analysis that was not valid JSON.");
  }

  return {
    scene_summary: parsed.scene_summary || "",
    objects: Array.isArray(parsed.objects)
      ? parsed.objects.slice(0, 5).map(normalizeByScore)
      : [],
    warning: parsed.warning || "",
  };
}
