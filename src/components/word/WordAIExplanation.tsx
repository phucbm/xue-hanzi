"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@clerk/nextjs";
import { SignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { streamWordAnalysis } from "@/lib/groq";
import {
  getAiExplanation,
  saveAiExplanation,
  getAiUsageStatus,
  type AiExplanation,
} from "@/app/actions/aiExplanation";
import { GUEST_DAILY_LIMIT, USER_DAILY_LIMIT } from "@/lib/aiConstants";
import { trackAiCall } from "@/core/pwa";
import { Check, ChevronDown, Copy, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { MovingBorder } from "@/components/phucbm/moving-border";
import { AiCreditBadge } from "@/components/shared/AiCreditBadge";
import { Skeleton } from "@/components/ui/skeleton";

let _promptTemplate: string | null = null;

async function buildPrompt(simp: string, trad?: string): Promise<string> {
  if (!_promptTemplate) {
    const res = await fetch("/prompts/word-analysis.md");
    _promptTemplate = await res.text();
  }
  const tradLine = trad && trad !== simp ? `\n- Traditional: ${trad}` : "";
  return _promptTemplate
    .replace(/\{\{simp\}\}/g, simp)
    .replace(/\{\{trad\}\}/g, trad ?? simp)
    .replace(/\{\{trad_line\}\}/g, tradLine);
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

interface WordAIExplanationProps {
  simp: string;
  trad?: string;
}

type Status = "idle" | "loading" | "streaming" | "done" | "error";

interface UsageStatus {
  remaining: number;
  limit: number;
  isSignedIn: boolean;
}

export function WordAIExplanation({ simp, trad }: WordAIExplanationProps) {
  const { isLoaded, isSignedIn, userId } = useAuth();

  const [status, setStatus] = useState<Status>("idle");
  const [streamContent, setStreamContent] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [cached, setCached] = useState<AiExplanation | null | undefined>(undefined);
  const [usage, setUsage] = useState<UsageStatus | null>(null);

  // Guest call count tracked in-memory per session (soft gate, server is backstop)
  const [guestCalls, setGuestCalls] = useState(0);

  const refreshUsage = useCallback(async () => {
    const u = await getAiUsageStatus();
    setUsage(u);
  }, []);

  useEffect(() => {
    setCached(undefined);
    setStatus("idle");
    setStreamContent("");
    setError("");

    getAiExplanation(simp).then(setCached);
  }, [simp]);

  useEffect(() => {
    if (isLoaded) refreshUsage();
  }, [isLoaded, refreshUsage]);

  const isRunning = status === "loading" || status === "streaming";
  const content = isRunning ? streamContent : (cached?.content ?? streamContent);
  const hasContent = !!content;

  const guestRemaining = GUEST_DAILY_LIMIT - guestCalls;
  const remaining = isSignedIn ? (usage?.remaining ?? null) : guestRemaining;
  const limit = isSignedIn ? USER_DAILY_LIMIT : GUEST_DAILY_LIMIT;
  const isLimited = remaining !== null && remaining <= 0;

  async function handleCopyPrompt() {
    const prompt = await buildPrompt(simp, trad);
    await navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  async function handleOpenChatGPT() {
    const prompt = await buildPrompt(simp, trad);
    await navigator.clipboard.writeText(prompt);
    window.open("https://chatgpt.com/", "_blank");
  }

  async function handleOpenClaude() {
    const prompt = await buildPrompt(simp, trad);
    await navigator.clipboard.writeText(prompt);
    window.open("https://claude.ai/new", "_blank");
  }

  async function handleOpenGemini() {
    const prompt = await buildPrompt(simp, trad);
    await navigator.clipboard.writeText(prompt);
    window.open("https://gemini.google.com/app", "_blank");
  }

  async function handleGenerate() {
    if (!isSignedIn && guestRemaining <= 0) {
      setError(`Đã dùng hết ${GUEST_DAILY_LIMIT} lượt hôm nay.`);
      return;
    }

    setStatus("loading");
    setStreamContent("");
    setError("");

    try {
      const stream = streamWordAnalysis(simp, trad);
      setStatus("streaming");

      if (!isSignedIn) setGuestCalls((n) => n + 1);

      let full = "";
      for await (const chunk of stream) {
        full += chunk;
        setStreamContent(full);
      }

      await saveAiExplanation(simp, full, "groq");
      void trackAiCall();

      // Refresh cached explanation and usage
      const [fresh, freshUsage] = await Promise.all([
        getAiExplanation(simp),
        getAiUsageStatus(),
      ]);
      setCached(fresh);
      setUsage(freshUsage);

      setStatus("done");
      setStreamContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.");
      setStatus("error");
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm">Giải thích bằng AI</p>
        <div className="flex items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            {!isRunning && (
              <AiCreditBadge remaining={remaining} limit={limit} />
            )}
            {/* mobile */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyPrompt}
              className="md:hidden gap-1.5 text-xs h-7 text-muted-foreground"
            >
              {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Prompt
            </Button>
            {/* desktop */}
            <ButtonGroup className="hidden md:flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyPrompt}
                className="gap-1.5 text-xs h-7 text-muted-foreground"
              >
                {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {promptCopied ? "Đã sao chép" : "Copy prompt"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground h-7 px-2 text-muted-foreground transition-colors">
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleOpenChatGPT}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    ChatGPT
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenClaude}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Claude.ai
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleOpenGemini}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Gemini
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={isRunning || isLimited}
              className="gap-1.5 text-xs h-7"
            >
              {isRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="hidden md:inline">
                {isRunning ? "Đang xử lý..." : cached ? "Tạo lại" : "Giải thích"}
              </span>
              <span className="md:hidden">
                {isRunning ? "AI..." : "AI"}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {cached === undefined && (
        <div className="flex flex-col gap-2 p-4 rounded-lg border bg-muted/40">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      )}

      {status === "error" && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {isLimited && !isSignedIn && (
        <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Tạo tài khoản để dùng thêm {USER_DAILY_LIMIT} lượt mỗi ngày
          </span>
          <SignUpButton mode="redirect">
            <Button variant="default" size="sm" className="text-xs h-7 ml-3 shrink-0">
              Đăng ký
            </Button>
          </SignUpButton>
        </div>
      )}

      {hasContent && (
        <MovingBorder
          className="overflow-hidden"
          radius={15}
          borderWidth={1}
          gradientWidth={800}
          duration={3}
          colors={["#005aff", "#4486ff", "#cad3ff"]}
        >
          <div className="bg-muted p-4 flex flex-col gap-3">
            <div className="relative">
              {!isRunning && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className="absolute top-0 right-0 h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Sao chép"
                  aria-label="Sao chép nội dung"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              )}
            <div className="prose prose-sm prose-neutral max-w-none
              prose-headings:font-semibold
              prose-h2:text-base prose-h2:mt-0
              prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1
              prose-p:my-1 prose-p:text-sm
              prose-li:text-sm prose-li:my-0
              prose-ul:my-1 prose-ul:pl-4
              prose-blockquote:text-sm prose-blockquote:not-italic prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-3 prose-blockquote:text-muted-foreground
              prose-strong:font-semibold
              prose-a:text-primary prose-a:no-underline hover:prose-a:no-underline">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <p className="text-xs text-muted-foreground">
                AI{cached && !isRunning
                  ? ` · ${relativeTime(cached.generatedAt)} · ${cached.userId === userId ? "bởi bạn" : "bởi một bạn học khác"}`
                  : ""} - nội dung được tạo bởi AI, có thể không chính xác và chỉ để tham khảo.
              </p>
            </div>
          </div>
        </MovingBorder>
      )}
    </div>
  );
}
