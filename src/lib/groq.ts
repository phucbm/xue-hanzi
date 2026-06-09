export async function streamWordAnalysis(
    simp: string,
    trad?: string,
    dictContext?: string,
    recentWords?: string[],
    modelId?: string,
): Promise<{ model: string; stream: AsyncGenerator<string> }> {
    const res = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simp, trad, dictContext, recentWords, modelId }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Lỗi ${res.status}: ${err}`);
    }

    const model = res.headers.get("X-AI-Model") ?? "openrouter";
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Không đọc được stream");

    async function* generate(): AsyncGenerator<string> {
        const decoder = new TextDecoder();
        let buffer = "";

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
                } catch {
                    // malformed SSE line, skip
                }
            }
        }
    }

    return { model, stream: generate() };
}
