import OpenAI from "openai";
import { z } from "zod";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

type LlmProvider = "deepseek" | "openai";

type LlmRuntimeConfig = {
  provider: LlmProvider;
  apiKey?: string;
  baseURL?: string;
  model: string;
};

function resolveConfig(): LlmRuntimeConfig {
  const hasDeepSeekConfig = Boolean(
    process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_MODEL,
  );

  if (hasDeepSeekConfig) {
    return {
      provider: "deepseek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL || process.env.AI_MODEL || DEFAULT_DEEPSEEK_MODEL,
    };
  }

  return {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL || process.env.AI_MODEL || DEFAULT_OPENAI_MODEL,
  };
}

export function getSafeLlmConfig() {
  const config = resolveConfig();

  return {
    provider: config.provider,
    baseURL: config.baseURL,
    model: config.model,
    hasApiKey: Boolean(config.apiKey),
  };
}

function getClient() {
  const config = resolveConfig();

  if (!config.apiKey) {
    const expectedKey =
      config.provider === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY";
    throw new ApiError(
      500,
      "missing_ai_key",
      `后端没有检测到 ${expectedKey}，无法调用真实大模型。`,
    );
  }

  const options: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey: config.apiKey,
    timeout: 60_000,
  };

  if (config.baseURL) {
    options.baseURL = config.baseURL;
  }

  return {
    client: new OpenAI(options),
    model: config.model,
  };
}

function extractJson(content: string) {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return trimmed;
}

export async function callJson<T>(
  name: string,
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  const { client, model } = getClient();

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\n你必须只返回一个合法 JSON object，不要返回 Markdown、解释、注释或代码块。`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new ApiError(502, "empty_llm_response", `${name} 没有返回内容。`);
    }

    const parsed = JSON.parse(extractJson(content));
    const validated = schema.safeParse(parsed);

    if (!validated.success) {
      const issues = validated.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
      throw new ApiError(
        502,
        "invalid_llm_json",
        `${name} 返回了 JSON，但结构不符合系统契约：${issues}`,
      );
    }

    return validated.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof SyntaxError) {
      throw new ApiError(502, "invalid_llm_json", `${name} 返回的不是合法 JSON。`);
    }

    const message = error instanceof Error ? error.message : "未知 LLM 调用错误。";
    throw new ApiError(502, "llm_call_failed", `${name} 调用失败：${message}`);
  }
}
