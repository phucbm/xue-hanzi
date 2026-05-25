"use client";

/**
 * WordTabContent — Content for a single word tab.
 * Desktop: 2-column grid — left col (sticky): WordInfoBox + StrokeBox,
 *                           right col (scrolls): Etymology, Definitions, Related.
 * Mobile: single column, stacked in reading order.
 * Data source: WordEntry from getWordEntries()
 */

import {WordInfoBox} from "@/components/word/WordInfoBox";
import {StrokeBox} from "@/components/word/StrokeBox";
import {EtymologySection} from "@/components/word/EtymologySection";
import {DefinitionSection} from "@/components/word/DefinitionSection";
import {RelatedSection} from "@/components/word/RelatedSection";
import {wordKey, type WordEntry} from "@/core/types";
import {useState} from "react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {CopyShareButton} from "@/components/shared/CopyShareButton";
import {ReportIssueDialog} from "@/components/ReportIssueDialog";
import {WordAIExplanation} from "@/components/word/WordAIExplanation";
import {Braces, Flag} from "lucide-react";

interface WordTabContentProps {
    entry: WordEntry;
    onWordClick: (simp: string) => void;
}

export function WordTabContent({ entry, onWordClick }: WordTabContentProps) {
    const isSingleChar = [...entry.simp].length === 1 && /\p{Script=Han}/u.test(entry.simp);
    const [debugOpen, setDebugOpen] = useState(false);

    return (
        <div className="">
            {/* etymology, definitions, related */}
            <div className="flex flex-col gap-6 relative w-full">

                {/* Action buttons — top right */}
                <div className="action-buttons flex justify-end items-center gap-0.5">
                    <ReportIssueDialog url={typeof window !== "undefined" ? window.location.href : undefined}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Báo lỗi"
                            aria-label="Báo lỗi"
                        >
                            <Flag className="h-3.5 w-3.5"/>
                        </Button>
                    </ReportIssueDialog>
                    <CopyShareButton simp={wordKey(entry)}/>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDebugOpen(true)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Xem dữ liệu thô"
                        aria-label="Xem dữ liệu thô"
                    >
                        <Braces className="h-3.5 w-3.5"/>
                    </Button>
                </div>

                <div className="grid gap-4" style={{ gridTemplateColumns: isSingleChar ? "1fr 1fr" : "1fr" }}>
                    <WordInfoBox entry={entry}/>
                    {isSingleChar && <StrokeBox simp={entry.simp} trad={entry.trad} defaultTrad={!!entry.key}/>}
                </div>


                {/* Debug dialog */}
                <Dialog open={debugOpen} onOpenChange={setDebugOpen}>
                    <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="font-chinese">
                                Dữ liệu thô — {entry.simp}
                            </DialogTitle>
                            <DialogDescription>
                                Nguồn: chinese-lexicon · CVDICT · Unihan kVietnamese
                            </DialogDescription>
                        </DialogHeader>
                        <div className="overflow-y-auto flex-1 min-h-0">
            <pre className="text-xs font-mono bg-muted rounded-md p-4 whitespace-pre-wrap break-words leading-relaxed">
              {JSON.stringify(entry, null, 2)}
            </pre>
                        </div>
                    </DialogContent>
                </Dialog>


                <WordAIExplanation simp={entry.simp} trad={entry.trad} wordEntry={entry}/>

                {isSingleChar && (
                    <EtymologySection entry={entry} onWordClick={onWordClick}/>
                )}

                <DefinitionSection entry={entry}/>
                <RelatedSection entry={entry} onWordClick={onWordClick}/>
            </div>
        </div>
    );
}
