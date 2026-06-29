export type StreamUsage = {
    tokensIn: number;
    tokensOut: number;
};

export async function streamWordAnalysis(
    simp: string,
    trad?: string,
    dictContext?: string,
    recentWords?: string[],
    modelId?: string,
    passphrase?: string,
): Promise<{ model: string; stream: AsyncGenerator<string>; usage: Promise<StreamUsage | null> }> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (passphrase) headers["Authorization"] = `Bearer ${passphrase}`;
    const res = await fetch("/api/ai/stream", {
        method: "POST",
        headers,
        body: JSON.stringify({ simp, trad, dictContext, recentWords, modelId }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Lỗi ${res.status}: ${err}`);
    }

    const model = res.headers.get("X-AI-Model") ?? "openrouter";
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Không đọc được stream");

    let resolveUsage!: (u: StreamUsage | null) => void;
    const usage = new Promise<StreamUsage | null>((r) => { resolveUsage = r; });

    async function* generate(): AsyncGenerator<string> {
        const decoder = new TextDecoder();
        let buffer = "";

        try {
            while (true) {
                const { done, value } = await reader!.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = line.slice(6).trim();
                    if (!data || data === "[DONE]") continue;
                    try {
                        const obj = JSON.parse(data);
                        const chunk = obj.choices?.[0]?.delta?.content;
                        if (chunk) yield chunk;
                        // OpenRouter sends usage on the last chunk
                        if (obj.usage) {
                            resolveUsage({
                                tokensIn: obj.usage.prompt_tokens ?? 0,
                                tokensOut: obj.usage.completion_tokens ?? 0,
                            });
                        }
                    } catch {
                        // malformed SSE line, skip
                    }
                }
            }
        } finally {
            resolveUsage(null);
        }
    }

    return { model, stream: generate(), usage };
}
