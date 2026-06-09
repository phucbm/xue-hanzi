import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { db, initSchema } from "@/lib/turso";
import { IP_DAILY_LIMIT, AI_WINDOW_MS } from "@/lib/aiConstants";
import { isAllowedModel, getDefaultModel } from "@/lib/aiModels";

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

export async function POST(req: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY ?? process.env.GROQ_API_KEY;

  if (!key) {
    return new Response("AI chưa được cấu hình.", { status: 503 });
  }

  const { simp, trad, dictContext, recentWords, modelId } = await req.json();
  if (!simp || typeof simp !== "string") {
    return new Response("Dữ liệu không hợp lệ.", { status: 400 });
  }
  const resolvedModel =
    process.env.AI_MODEL ??
    (isAllowedModel(modelId) ? modelId : null) ??
    getDefaultModel().id;

  await ensureSchema();

  if (db) {
    const ip = getClientIp(req);
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
    const err = await upstream.text();
    return new Response(`Lỗi từ AI (${upstream.status}): ${err}`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-AI-Model": resolvedModel,
    },
  });
}
