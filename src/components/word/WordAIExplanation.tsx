"use client";

import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { streamWordAnalysis, type StreamUsage } from "@/lib/openrouter";
import {
  getAiExplanation,
  saveAiExplanation,
  type AiExplanation,
} from "@/app/actions/aiExplanation";
import type { WordEntry } from "@/core/types";
import { trackAiCall } from "@/core/pwa";
import { Check, ChevronDown, Copy, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { MovingBorder } from "@/components/phucbm/moving-border";
import { Skeleton } from "@/components/ui/skeleton";
import { AI_MODELS, getDefaultModel, getModelById, calcCost, type AiModel } from "@/lib/aiModels";
import { getPassphrase } from "@/lib/passphrase";

const AI_MODEL_STORAGE_KEY = "hch_selected_ai_model";
const AI_MODEL_ERRORS_KEY = "hch_ai_model_errors";

function formatPrice(perToken: number): string {
  const per1M = perToken * 1_000_000;
  if (per1M === 0) return "$0";
  return `$${per1M < 1 ? per1M.toFixed(2) : per1M.toFixed(0)}`;
}

function getSavedModel(): AiModel {
  if (typeof window === "undefined") return getDefaultModel();
  const saved = localStorage.getItem(AI_MODEL_STORAGE_KEY);
  if (saved) {
    const model = getModelById(saved);
    if (model) return model;
  }
  return getDefaultModel();
}

function getModelErrors(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(AI_MODEL_ERRORS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveModelError(modelId: string, message: string) {
  const errors = getModelErrors();
  errors[modelId] = message;
  localStorage.setItem(AI_MODEL_ERRORS_KEY, JSON.stringify(errors));
}

function clearModelError(modelId: string) {
  const errors = getModelErrors();
  delete errors[modelId];
  localStorage.setItem(AI_MODEL_ERRORS_KEY, JSON.stringify(errors));
}

let _promptTemplate: string | null = null;

function buildDictContext(entry: WordEntry): string {
  const lines: string[] = [];
  lines.push(`Chữ/từ: ${entry.simp}${entry.trad !== entry.simp ? ` / ${entry.trad}` : ""}`);
  lines.push(`Bính âm: ${entry.pinyin}`);
  if (entry.sinoVietnamese) lines.push(`Hán Việt: ${entry.sinoVietnamese}`);
  if (entry.statistics.hskLevel) lines.push(`HSK: ${entry.statistics.hskLevel}`);
  if (entry.definitionVi) lines.push(`Nghĩa tiếng Việt: ${entry.definitionVi}`);
  if (entry.definitionsEn.length > 0) lines.push(`Nghĩa tiếng Anh: ${entry.definitionsEn.join("; ")}`);
  if (entry.etymology) {
    const typeLabel = (t: string) => t === "meaning" ? "nghĩa" : t === "sound" ? "gợi âm" : "không rõ";
    if (entry.etymology.notes) lines.push(`Ghi chú nguồn gốc: ${entry.etymology.notes}`);
    if (entry.etymology.components.length > 0) {
      lines.push("Thành phần:");
      for (const c of entry.etymology.components) {
        const sv = c.sinoVietnamese ? ` / Hán Việt: ${c.sinoVietnamese}` : "";
        lines.push(`  - ${c.char} (${typeLabel(c.type)}): ${c.definition} [${c.pinyin}]${sv}`);
      }
    }
  }
  return lines.join("\n");
}

async function buildPrompt(simp: string, trad?: string, dictContext?: string, recentWords?: string[]): Promise<string> {
  if (!_promptTemplate) {
    const res = await fetch("/prompts/word-analysis.md");
    _promptTemplate = await res.text();
  }
  const tradLine = trad && trad !== simp ? `\n- Traditional: ${trad}` : "";
  const hints = recentWords && recentWords.length > 0
    ? recentWords.filter((w) => w !== simp).slice(0, 15).join(", ")
    : "";
  const recentWordsBlock = hints
    ? `Người dùng đã tra cứu các từ này gần đây: ${hints}\nNếu tự nhiên và không gượng, ưu tiên dùng trong câu ví dụ. Không bắt buộc.`
    : "";
  return _promptTemplate
    .replace(/\{\{simp\}\}/g, simp)
    .replace(/\{\{trad\}\}/g, trad ?? simp)
    .replace(/\{\{trad_line\}\}/g, tradLine)
    .replace(/\{\{dict_context\}\}/g, dictContext ?? "(không có dữ liệu từ điển)")
    .replace(/\{\{recent_words\}\}/g, recentWordsBlock);
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function ModelMenuItem({ m, selected, error, onSelect, showPrice }: {
  m: AiModel;
  selected: boolean;
  error?: string;
  onSelect: (m: AiModel) => void;
  showPrice: boolean;
}) {
  return (
    <DropdownMenuItem
      onClick={() => onSelect(m)}
      className="flex items-center justify-between gap-2"
      title={error ?? undefined}
    >
      <span className="flex items-center gap-1.5 font-medium text-xs min-w-0 truncate">
        {error && <IconAlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
        {m.label}
        <span className="text-muted-foreground font-normal">{m.provider}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0 text-[10px] text-muted-foreground font-mono">
        {showPrice && (
          <>
            <span title="input per 1M tokens">{formatPrice(m.pricing.promptPerToken)}</span>
            <span>/</span>
            <span title="output per 1M tokens">{formatPrice(m.pricing.completionPerToken)}</span>
          </>
        )}
        {selected && <Check className="h-3.5 w-3.5 ml-1 text-foreground" />}
      </span>
    </DropdownMenuItem>
  );
}

interface WordAIExplanationProps {
  simp: string;
  trad?: string;
  wordEntry?: WordEntry;
  recentWords?: string[];
}

type Status = "idle" | "loading" | "streaming" | "done" | "error";

export function WordAIExplanation({ simp, trad, wordEntry, recentWords }: WordAIExplanationProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [streamContent, setStreamContent] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [cached, setCached] = useState<AiExplanation | null | undefined>(undefined);
  const [selectedModel, setSelectedModel] = useState<AiModel>(getSavedModel);
  const [modelErrors, setModelErrors] = useState<Record<string, string>>(getModelErrors);
  const [lastUsage, setLastUsage] = useState<StreamUsage | null>(null);
  const isLoggedIn = !!getPassphrase();
  const visibleModels = AI_MODELS.filter((m) => !m.paid || isLoggedIn);

  function handleSelectModel(m: AiModel) {
    setSelectedModel(m);
    localStorage.setItem(AI_MODEL_STORAGE_KEY, m.id);
  }

  const dictContext = wordEntry ? buildDictContext(wordEntry) : undefined;

  useEffect(() => {
    setCached(undefined);
    setStatus("idle");
    setStreamContent("");
    setError("");
    getAiExplanation(simp).then(setCached);
  }, [simp]);

  const isRunning = status === "loading" || status === "streaming";
  const content = isRunning ? streamContent : (cached?.content ?? streamContent);
  const hasContent = !!content;

  async function handleCopyPrompt() {
    const prompt = await buildPrompt(simp, trad, dictContext, recentWords);
    await navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  }

  async function handleOpenChatGPT() {
    const prompt = await buildPrompt(simp, trad, dictContext, recentWords);
    await navigator.clipboard.writeText(prompt);
    window.open("https://chatgpt.com/", "_blank");
  }

  async function handleOpenClaude() {
    const prompt = await buildPrompt(simp, trad, dictContext, recentWords);
    await navigator.clipboard.writeText(prompt);
    window.open("https://claude.ai/new", "_blank");
  }

  async function handleOpenGemini() {
    const prompt = await buildPrompt(simp, trad, dictContext, recentWords);
    await navigator.clipboard.writeText(prompt);
    window.open("https://gemini.google.com/app", "_blank");
  }

  async function handleGenerate() {
    setStatus("loading");
    setStreamContent("");
    setError("");
    setLastUsage(null);

    try {
      const { model: aiModel, stream, usage } = await streamWordAnalysis(simp, trad, dictContext, recentWords, selectedModel.id, getPassphrase() ?? undefined);
      setStatus("streaming");

      let full = "";
      for await (const chunk of stream) {
        full += chunk;
        setStreamContent(full);
      }

      const u = await usage;
      if (u) setLastUsage(u);

      await saveAiExplanation(simp, full, aiModel);
      void trackAiCall();

      clearModelError(selectedModel.id);
      setModelErrors(getModelErrors());

      const fresh = await getAiExplanation(simp);
      setCached(fresh);

      setStatus("done");
      setStreamContent("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
      setError(msg);
      setStatus("error");
      saveModelError(selectedModel.id, msg);
      setModelErrors(getModelErrors());
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
        <div className="flex items-center gap-1.5">
          {/* Copy prompt — mobile */}
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
          {/* Copy prompt — desktop */}
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
          {/* Generate button with model selector */}
          <ButtonGroup>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={isRunning}
              className="gap-1.5 text-xs h-7"
              title={selectedModel.id}
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
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isRunning}
                className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground h-7 px-2 text-muted-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground py-1 px-2">Miễn phí</DropdownMenuLabel>
                  {visibleModels.filter((m) => !m.paid).map((m) => (
                    <ModelMenuItem key={m.id} m={m} selected={m.id === selectedModel.id} error={modelErrors[m.id]} onSelect={handleSelectModel} showPrice={false} />
                  ))}
                </DropdownMenuGroup>
                {isLoggedIn && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground py-1 px-2">Trả phí</DropdownMenuLabel>
                      {visibleModels.filter((m) => m.paid).map((m) => (
                        <ModelMenuItem key={m.id} m={m} selected={m.id === selectedModel.id} error={modelErrors[m.id]} onSelect={handleSelectModel} showPrice />
                      ))}
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
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
        <p className="text-sm text-destructive"><code className="break-all bg-red-200 p-2 block rounded-md">{error}</code></p>
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
                  ? ` · ${relativeTime(cached.generatedAt)} · bởi cộng đồng · ${cached.model}`
                  : isRunning ? ` · ${selectedModel.label}` : ""}
                {lastUsage && !isRunning && (() => {
                  const cost = calcCost(selectedModel.id, lastUsage.tokensIn, lastUsage.tokensOut);
                  const vnd = Math.round(cost * 26000);
                  return ` · ${lastUsage.tokensIn + lastUsage.tokensOut} tokens${cost > 0 ? ` · ${vnd > 0 ? `${vnd.toLocaleString("vi-VN")}₫` : "<1₫"}` : ""}`;
                })()}
                {" "}- nội dung được tạo bởi AI, có thể không chính xác và chỉ để tham khảo.
              </p>
            </div>
          </div>
        </MovingBorder>
      )}
    </div>
  );
}
