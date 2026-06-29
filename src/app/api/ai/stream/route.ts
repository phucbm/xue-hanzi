import { NextRequest } from "next/server";
import { after } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { db, initSchema } from "@/lib/turso";
import { IP_DAILY_LIMIT, AI_WINDOW_MS } from "@/lib/aiConstants";
import { isAllowedModel, isPaidModel, getDefaultModel } from "@/lib/aiModels";
import { verifyHistoryPassphrase } from "@/lib/historyAuth";
import { observe, propagateAttributes, setActiveTraceIO, LangfuseOtelSpanAttributes } from "@langfuse/tracing";
import { context, trace } from "@opentelemetry/api";
import { langfuseSpanProcessor } from "@/instrumentation";

const AI_API_URL = "https://openrouter.ai/api/v1/chat/completions";

let schemaReady = false;

async function ensureSchema() {
  if (!schemaReady && db) {
    await initSchema();
    schemaReady = true;
  }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function extractTextFromSseChunk(chunk: string): string {
  let text = "";
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const obj = JSON.parse(data);
      const content = obj.choices?.[0]?.delta?.content;
      if (content) text += content;
    } catch {
      // malformed SSE line
    }
  }
  return text;
}

const handler = async (req: NextRequest) => {
  const ip = getClientIp(req);
  const body = await req.json();
  const requestedModel = body.modelId as string | undefined;
  if (isPaidModel(requestedModel) && !verifyHistoryPassphrase(req)) {
    return new Response("Cần đăng nhập để dùng model trả phí.", { status: 401 });
  }
  const resolvedModel = (isAllowedModel(requestedModel) ? requestedModel : null) ?? getDefaultModel().id;

  // capture observe()'s root span BEFORE propagateAttributes nests further
  const rootCtx = context.active();
  const rootSpan = trace.getActiveSpan();

  return propagateAttributes(
    {
      traceName: "word-analysis",
      userId: process.env.HISTORY_PASSPHRASE,
      sessionId: `ip:${ip}`,
      tags: ["word-analysis"],
      metadata: { ip, model: resolvedModel },
    },
    () => handleStream(req, body, resolvedModel, ip, rootCtx, rootSpan)
  );
};

const handleStream = async (
  req: NextRequest,
  body: Record<string, unknown>,
  resolvedModel: string,
  ip: string,
  rootCtx: ReturnType<typeof context.active>,
  rootSpan: ReturnType<typeof trace.getActiveSpan>
) => {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    return new Response("AI chưa được cấu hình.", { status: 503 });
  }

  const simp = body.simp as string | undefined;
  const trad = body.trad as string | undefined;
  const dictContext = body.dictContext as string | undefined;
  const recentWords = body.recentWords as string[] | undefined;
  if (!simp || typeof simp !== "string") {
    return new Response("Dữ liệu không hợp lệ.", { status: 400 });
  }

  await ensureSchema();

  if (db) {
    const cutoff = new Date(Date.now() - AI_WINDOW_MS).toISOString();
    const result = await db.execute({
      sql: "SELECT COUNT(*) as count FROM ai_usage_log WHERE user_id = ? AND called_at > ?",
      args: [`ip:${ip}`, cutoff],
    });
    const count = (result.rows[0] as Record<string, unknown>).count as number;
    if (count >= IP_DAILY_LIMIT) {
      return new Response(
        `Đã dùng hết ${IP_DAILY_LIMIT} lượt AI hôm nay. Vui lòng thử lại sau 24 giờ.`,
        { status: 429 }
      );
    }
    await db.execute({
      sql: "INSERT INTO ai_usage_log (id, user_id, called_at) VALUES (?, ?, ?)",
      args: [crypto.randomUUID(), `ip:${ip}`, new Date().toISOString()],
    });
  }

  const templatePath = path.join(process.cwd(), "public/prompts/word-analysis.md");
  const template = await readFile(templatePath, "utf-8");
  const tradLine = trad && trad !== simp ? `\n- Traditional: ${trad}` : "";
  const recentWordsBlock =
    Array.isArray(recentWords) && recentWords.length > 0
      ? `Người dùng đã tra cứu các từ này gần đây: ${(recentWords as string[]).filter((w) => w !== simp).slice(0, 15).join(", ")}\nNếu tự nhiên và không gượng, ưu tiên dùng trong câu ví dụ. Không bắt buộc.`
      : "";
  const prompt = template
    .replace(/\{\{simp\}\}/g, simp)
    .replace(/\{\{trad\}\}/g, trad ?? simp)
    .replace(/\{\{trad_line\}\}/g, tradLine)
    .replace(/\{\{dict_context\}\}/g, dictContext && typeof dictContext === "string" ? dictContext : "(không có dữ liệu từ điển)")
    .replace(/\{\{recent_words\}\}/g, recentWordsBlock);

  // mark as generation so Langfuse populates model column
  trace.getActiveSpan()?.setAttribute(LangfuseOtelSpanAttributes.OBSERVATION_TYPE, "generation");
  trace.getActiveSpan()?.setAttribute(LangfuseOtelSpanAttributes.OBSERVATION_MODEL, resolvedModel);

  const upstream = await fetch(AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: resolvedModel,
      stream: true,
      temperature: 0,
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!upstream.ok) {
    trace.getActiveSpan()?.end();
    const err = await upstream.text();
    return new Response(`Lỗi từ AI (${upstream.status}): ${err}`, { status: 502 });
  }

  const [clientStream, captureStream] = upstream.body!.tee();

  const capturePromise = (async () => {
    const reader = captureStream.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += extractTextFromSseChunk(decoder.decode(value, { stream: true }));
      }
    } finally {
      // set input+output together on root span to avoid partial overwrites
      context.with(rootCtx, () => {
        setActiveTraceIO({ input: prompt, output: fullText });
        rootSpan?.end();
      });
    }
  })();

  after(async () => {
    await capturePromise;
    await langfuseSpanProcessor.forceFlush();
  });

  return new Response(clientStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-AI-Model": resolvedModel,
    },
  });
};

export const POST = observe(handler, {
  name: "word-analysis",
  endOnExit: false,
});
