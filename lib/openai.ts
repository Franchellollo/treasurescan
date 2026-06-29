import type { ObjectResult } from "@/components/ObjectResultCard";

export type AnalyzeFrameResult = {
  scene_summary: string;
  objects: ObjectResult[];
  warning: string;
};

const visionPrompt = `Analyze this camera frame as an expert assistant for identifying potentially valuable old objects in thrift stores, attics, flea markets, church restorations, and demolition/restoration sites.

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
    objects: Array.isArray(parsed.objects) ? parsed.objects.map(normalizeByScore) : [],
    warning: parsed.warning || "",
  };
}
