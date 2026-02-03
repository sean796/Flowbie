import React, { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wrench, Loader2, Upload, FileText, Download, Printer, Check, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WordPressSite } from "@/components/integrations/types";
import { interpretSemTaskList, type InterpretedSemTask } from "@/lib/sem-task-interpreter";
import { SEM_FOCUS_CATEGORIES, deriveSuggestedFocusFromFileName, deriveFocusFromTask } from "@/lib/sem-categories";
import { CYBERPUNK_CLASSES } from "./cyberpunk-theme";
import { useContentOptimization } from "@/hooks/use-content-optimization";

export type SemTaskRow = InterpretedSemTask & {
  status: "pending" | "fixing" | "done" | "error";
  changeSummary?: string;
  error?: string;
  /** Per-row checklist completion (one boolean per checklist item) */
  checklistDone: boolean[];
  /** Tech spec prompt sent to AI (for "View prompt" expandable) */
  promptSent?: { system: string; user: string };
};

/** Full-post optimizer (Death Star flow) with optional SEM task context. SEM fix path returns optimizationChanges. */
type OnOptimizeContent = (
  site: WordPressSite,
  url: string,
  updateMode: "update" | "draft",
  setGscQueriesForSelection: (prev: any) => any,
  setIsKeywordSelectionOpen: (prev: any) => any,
  setGscClusterAnalysis: (prev: any) => any,
  setIsAnalyzingClusters: (prev: any) => any,
  skipOnNoGSC: boolean,
  optimizationOptions?: { optimizeTitle?: boolean; optimizeMeta?: boolean; optimizeExcerpt?: boolean; optimizeContent?: boolean },
  inContentImageRequest?: { imageType: string; userPrompt?: string },
  resolvedPost?: { id: number; subtype: string; link?: string; slug?: string; endpoint?: string },
  testMode?: boolean,
  semTaskContext?: { suggestedAction: string; checklist?: string[]; promptModifier?: string; focusCategories?: string[] }
) => Promise<{ optimizationChanges?: Record<string, unknown> } | void | undefined>;

interface SEMTaskListDialogProps {
  site: WordPressSite;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOptimizeContent: OnOptimizeContent;
  setGscQueriesForSelection: (prev: any) => any;
  setIsKeywordSelectionOpen: (prev: any) => any;
  setGscClusterAnalysis: (prev: any) => any;
  setIsAnalyzingClusters: (prev: any) => any;
}

export const SEMTaskListDialog: React.FC<SEMTaskListDialogProps> = ({
  site,
  open,
  onOpenChange,
  onOptimizeContent,
  setGscQueriesForSelection,
  setIsKeywordSelectionOpen,
  setGscClusterAnalysis,
  setIsAnalyzingClusters,
}) => {
  // Access pendingOptimization reactively from hook
  const { pendingOptimization } = useContentOptimization();
  
  // Store changes by URL for tracking (persists after cleanup)
  const [changesByUrl, setChangesByUrl] = useState<Record<string, { titleChanged?: boolean; metaChanged?: boolean; contentChanged?: boolean; title?: string; meta?: string; postUpdated?: boolean; promptSent?: { system: string; user: string } }>>({});
  
  // Watch for changes in pendingOptimization and store them
  useEffect(() => {
    const pending = pendingOptimization[site.id];
    if (pending?.optimizationChanges && pending.url) {
      setChangesByUrl(prev => ({
        ...prev,
        [pending.url]: pending.optimizationChanges
      }));
    }
  }, [pendingOptimization, site.id]);
  const [rawList, setRawList] = useState("");
  const [tasks, setTasks] = useState<SemTaskRow[]>([]);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [focusCategories, setFocusCategories] = useState<string[]>([]);
  const [suggestedFocusFromFile, setSuggestedFocusFromFile] = useState<string | null>(null);
  const [suggestedFocusFileName, setSuggestedFocusFileName] = useState<string | null>(null);
  const [promptModifier, setPromptModifier] = useState("");
  const [expandedPromptKey, setExpandedPromptKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFocusCategory = useCallback((category: string) => {
    setFocusCategories((prev) => {
      const has = prev.includes(category);
      if (has) return prev.filter((c) => c !== category);
      return [...prev, category];
    });
  }, []);

  const hasAtLeastOneCategory = focusCategories.length > 0;
  // When no focus selected, we derive focus from each task's suggestedAction/checklist (no double list)

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const suggested = deriveSuggestedFocusFromFileName(file.name);
      setFocusCategories((prev) => {
        const merged = [...new Set([...suggested, ...prev])];
        return merged.length > 0 ? merged : prev;
      });
      setSuggestedFocusFromFile(suggested.length > 0 ? suggested.join(", ") : null);
      setSuggestedFocusFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const text = (reader.result as string) ?? "";
        setRawList(text);
        toast.success(suggested.length > 0 ? `List loaded. Suggested focus: ${suggested.join(", ")} (you can add more)` : "List loaded");
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    []
  );

  const handleInterpretList = useCallback(async () => {
    if (!rawList.trim()) {
      toast.error("Paste or upload a task list first.");
      return;
    }
    // No longer require focus selection: we derive focus from each task's action/checklist when fixing
    setIsInterpreting(true);
    try {
      const interpreted = await interpretSemTaskList(
        rawList,
        site.siteUrl,
        focusCategories,
        promptModifier.trim() || undefined
      );
      setTasks(
        interpreted.map((t) => ({
          ...t,
          status: "pending" as const,
          changeSummary: undefined,
          error: undefined,
          checklistDone: (t.checklist ?? []).map(() => false),
        }))
      );
      toast.success(`Interpreted ${interpreted.length} task(s).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Interpretation failed.";
      toast.error(msg);
    } finally {
      setIsInterpreting(false);
    }
  }, [rawList, site.siteUrl, focusCategories, promptModifier, hasAtLeastOneCategory]);

  const runFixForTask = useCallback(
    async (task: SemTaskRow) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.url === task.url && t.lineIndex === task.lineIndex
            ? { ...t, status: "fixing" as const }
            : t
        )
      );
      try {
        // Use task's checklist as single source of truth: derive focus from task when user hasn't selected focus areas (no double list)
        const effectiveFocus =
          focusCategories.length > 0
            ? focusCategories
            : deriveFocusFromTask(task.suggestedAction ?? "", task.checklist ?? []);

        // Map focus to optimization options
        const shouldOptimizeTitle = effectiveFocus.some(
          (cat) => cat.includes("Title") || cat.includes("meta description")
        );
        const shouldOptimizeMeta = effectiveFocus.some(
          (cat) => cat.includes("Title") || cat.includes("meta description")
        );
        const shouldOptimizeContent = effectiveFocus.some(
          (cat) => cat.includes("Content") || cat.includes("keyword optimization")
        );

        const result = await onOptimizeContent(
          site,
          task.url,
          "update",
          setGscQueriesForSelection,
          setIsKeywordSelectionOpen,
          setGscClusterAnalysis,
          setIsAnalyzingClusters,
          true,
          {
            optimizeTitle: shouldOptimizeTitle,
            optimizeMeta: shouldOptimizeMeta,
            optimizeExcerpt: shouldOptimizeMeta,
            optimizeContent: shouldOptimizeContent,
          },
          undefined,
          undefined,
          false,
          {
            suggestedAction: task.suggestedAction ?? "",
            checklist: task.checklist ?? [],
            promptModifier: promptModifier.trim() || undefined,
            focusCategories: effectiveFocus, // Pass derived or selected focus so backend respects it
          }
        );

        // Use returned optimizationChanges from SEM fix path (avoids stale state in poll)
        let changes: any = null;
        if (result != null && typeof result === "object" && "optimizationChanges" in result) {
          changes = (result as { optimizationChanges: Record<string, unknown> }).optimizationChanges;
        }
        if (changes) {
          setChangesByUrl(prev => ({ ...prev, [task.url]: changes }));
        }
        // Fallback: poll for changes (e.g. full optimization path)
        if (!changes) {
          for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const pending = pendingOptimization[site.id];
            if (pending?.optimizationChanges) {
              changes = pending.optimizationChanges;
              setChangesByUrl(prev => ({ ...prev, [task.url]: pending.optimizationChanges }));
              break;
            }
            if (changesByUrl[task.url]) {
              changes = changesByUrl[task.url];
              break;
            }
          }
        }
        
        // Change summary: show what we changed (cached original vs final); postUpdated => "Post has been updated" + details
        const changeParts: string[] = [];
        if (changes?.titleChanged && changes.title) {
          changeParts.push(`Title: "${changes.title.substring(0, 40)}${changes.title.length > 40 ? '...' : ''}"`);
        }
        if (changes?.metaChanged && changes.meta) {
          changeParts.push(`Meta: "${changes.meta.substring(0, 40)}${changes.meta.length > 40 ? '...' : ''}"`);
        }
        if (changes?.contentChanged) {
          changeParts.push("Content updated");
        }
        let changeSummary: string;
        if (changes?.postUpdated === true) {
          changeSummary = changeParts.length > 0 ? `Post updated — ${changeParts.join("; ")}` : "Post has been updated";
        } else {
          changeSummary = changeParts.length > 0 ? changeParts.join("; ") : "No changes detected";
        }
        
        // Map checklist items to actual changes
        const checklistDone = (task.checklist ?? []).map((item, idx) => {
          const itemLower = item.toLowerCase();
          if (itemLower.includes('title')) {
            return changes?.titleChanged === true;
          }
          if (itemLower.includes('meta') || itemLower.includes('description')) {
            return changes?.metaChanged === true;
          }
          if (itemLower.includes('content') || itemLower.includes('keyword')) {
            return changes?.contentChanged === true;
          }
          // If we don't know, assume it was done if any change occurred
          return changes?.titleChanged || changes?.metaChanged || changes?.contentChanged || false;
        });
        
        setTasks((prev) =>
          prev.map((t) =>
            t.url === task.url && t.lineIndex === task.lineIndex
              ? {
                  ...t,
                  status: "done" as const,
                  changeSummary,
                  checklistDone,
                  promptSent: changes?.promptSent,
                }
              : t
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Optimization failed.";
        setTasks((prev) =>
          prev.map((t) =>
            t.url === task.url && t.lineIndex === task.lineIndex
              ? { ...t, status: "error" as const, error: msg }
              : t
          )
        );
      }
    },
    [site, promptModifier, onOptimizeContent, setGscQueriesForSelection, setIsKeywordSelectionOpen, setGscClusterAnalysis, setIsAnalyzingClusters]
  );

  const handleFixIt = useCallback(async () => {
    const pending = tasks.filter((t) => t.status === "pending");
    if (pending.length === 0) {
      toast.info("No pending tasks to fix.");
      return;
    }
    setIsFixing(true);
    for (const task of pending) {
      await runFixForTask(task);
    }
    setIsFixing(false);
    toast.success(`Fix run complete. ${pending.length} task(s) processed.`);
  }, [tasks, runFixForTask]);

  const handleExportSheet = useCallback(() => {
    const header = "lineIndex,url,suggestedAction,checklist,checklistDone,status,changeSummary,error\n";
    const rows = tasks.map(
      (t) =>
        `${t.lineIndex},"${(t.url || "").replace(/"/g, '""')}","${(t.suggestedAction || "").replace(/"/g, '""')}","${(t.checklist ?? []).join("; ").replace(/"/g, '""')}","${(t.checklistDone ?? []).map((d) => (d ? "1" : "0")).join("")}",${t.status},"${(t.changeSummary ?? "").replace(/"/g, '""')}","${(t.error ?? "").replace(/"/g, '""')}"`
    );
    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sem-task-list-results.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Sheet exported.");
  }, [tasks]);

  const handlePrintSheet = useCallback(() => {
    setPrintDialogOpen(true);
  }, []);

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const hasTasks = tasks.length > 0;

  return (
    <>
      <style>{`
        @keyframes breatheNeon {
          0%, 100% { box-shadow: 0 0 10px rgba(34, 197, 94, 0.5), 0 0 20px rgba(34, 197, 94, 0.3), 0 0 30px rgba(34, 197, 94, 0.2), inset 0 0 10px rgba(34, 197, 94, 0.1); }
          50% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.8), 0 0 40px rgba(34, 197, 94, 0.6), 0 0 60px rgba(34, 197, 94, 0.4), inset 0 0 20px rgba(34, 197, 94, 0.2); }
        }
      `}</style>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "max-w-3xl max-h-[90vh] overflow-auto bg-[#0a0a0a] border-2 border-green-500/50",
            "animate-[breatheNeon_3s_ease-in-out_infinite] [&[data-state=open]]:animate-none [&[data-state=closed]]:animate-none"
          )}
        >
          <DialogHeader className="border-b border-green-500/20 pb-3">
            <DialogTitle className={cn("text-xl font-bold font-mono tracking-wider", CYBERPUNK_CLASSES.textPrimary)}>
              SEM Task List – {site.name}
            </DialogTitle>
            <DialogDescription className={cn("font-mono text-sm", CYBERPUNK_CLASSES.textMuted)}>
              Upload a list of URLs or issues; AI interprets and fixes content on this WordPress site.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Focus areas: only show before interpreting – after interpret, task checklist is the single list (no double list) */}
            {!hasTasks && (
              <div>
                <Label className={cn("text-sm font-mono", CYBERPUNK_CLASSES.textPrimary)}>
                  Focus areas (optional – leave unchecked to use each task&apos;s action)
                </Label>
                {suggestedFocusFromFile && (
                  <p className={cn("mt-1 text-xs font-mono", CYBERPUNK_CLASSES.textMuted)}>
                    From file &quot;{suggestedFocusFileName}&quot; → <span className="text-green-400">{suggestedFocusFromFile}</span>. Add or change focus below.
                  </p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1.5">
                  {SEM_FOCUS_CATEGORIES.map((cat) => (
                    <label
                      key={cat}
                      className={cn(
                        "flex items-center gap-1.5 cursor-pointer font-mono text-sm",
                        focusCategories.includes(cat) ? "text-green-300" : CYBERPUNK_CLASSES.textMuted
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={focusCategories.includes(cat)}
                        onChange={() => toggleFocusCategory(cat)}
                        className="rounded border-green-500/50 bg-[#0a0a0a] text-green-500 focus:ring-green-500/50"
                      />
                      <span>{cat}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {hasTasks && (
              <p className={cn("text-xs font-mono", CYBERPUNK_CLASSES.textMuted)}>
                Using each task&apos;s action and checklist – fix runs only what the checklist says. Change column shows exactly what was updated.
              </p>
            )}

            {/* Optional prompt modifier – e.g. set title to 'agentic agent' */}
            <div>
              <Label className={cn("text-sm font-mono", CYBERPUNK_CLASSES.textMuted)}>
                Optional prompt modifier
              </Label>
              <textarea
                className={cn(
                  "mt-1 w-full min-h-[60px] rounded-md border border-green-500/30 bg-[#0a0a0a] px-3 py-2 text-sm font-mono text-green-300",
                  "placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
                )}
                placeholder="e.g. Set title to 'agentic agent'; prefer canonical URLs"
                value={promptModifier}
                onChange={(e) => setPromptModifier(e.target.value)}
              />
            </div>

            <div>
              <Label className={cn("text-sm font-mono", CYBERPUNK_CLASSES.textMuted)}>
                Task list (paste or upload CSV/text, one item per line)
              </Label>
              <div className="flex gap-2 mt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  aria-hidden
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={CYBERPUNK_CLASSES.buttonNeon}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Upload
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={CYBERPUNK_CLASSES.buttonNeon}
                  onClick={handleInterpretList}
                  disabled={!rawList.trim() || isInterpreting}
                >
                  {isInterpreting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-1 inline" />
                      Interpret list
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleFixIt}
                  variant="outline"
                  size="sm"
                  disabled={pendingCount === 0 || isFixing || !hasTasks}
                  className={cn(CYBERPUNK_CLASSES.buttonNeon, "border-green-500 text-green-300 hover:bg-green-500/20")}
                >
                  {isFixing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Fixing...
                    </>
                  ) : (
                    <>
                      <Wrench className="h-4 w-4 mr-2" />
                      Fix it (AI Technical Mechanic)
                    </>
                  )}
                </Button>
              </div>
              <textarea
                className={cn(
                  "mt-2 w-full min-h-[100px] rounded-md border border-green-500/30 bg-[#0a0a0a] px-3 py-2 text-sm font-mono text-green-300",
                  "placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
                )}
                placeholder="Paste URLs or lines like: https://example.com/page, Fix title and meta"
                value={rawList}
                onChange={(e) => setRawList(e.target.value)}
              />
            </div>

            {hasTasks && (
              <>
                <div className={cn("rounded-md overflow-x-auto border-2", CYBERPUNK_CLASSES.borderNeon)}>
                  <table className="w-full text-sm font-mono">
                    <thead>
                      <tr className={cn("border-b", CYBERPUNK_CLASSES.borderDivider, CYBERPUNK_CLASSES.bgNeon)}>
                        <th className={cn("text-left p-2", CYBERPUNK_CLASSES.textPrimary)}>#</th>
                        <th className={cn("text-left p-2", CYBERPUNK_CLASSES.textPrimary)}>URL</th>
                        <th className={cn("text-left p-2", CYBERPUNK_CLASSES.textPrimary)}>Action</th>
                        <th className={cn("text-left p-2 min-w-[200px]", CYBERPUNK_CLASSES.textPrimary)}>Checklist</th>
                        <th className={cn("text-left p-2", CYBERPUNK_CLASSES.textPrimary)}>Status</th>
                        <th className={cn("text-left p-2", CYBERPUNK_CLASSES.textPrimary)}>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((t, idx) => (
                        <tr
                          key={`${t.lineIndex}-${t.url}-${idx}`}
                          className={cn("border-b", CYBERPUNK_CLASSES.borderDivider)}
                        >
                          <td className={cn("p-2", CYBERPUNK_CLASSES.textMuted)}>{t.lineIndex}</td>
                          <td className={cn("p-2 max-w-[180px] truncate", CYBERPUNK_CLASSES.textMuted)} title={t.url}>
                            {t.url}
                          </td>
                          <td className={cn("p-2", CYBERPUNK_CLASSES.textMuted)}>{t.suggestedAction}</td>
                          <td className="p-2">
                            <ul className="list-none space-y-0.5 m-0 p-0 text-xs">
                              {(t.checklist ?? []).map((item, i) => (
                                <li key={i} className="flex items-start gap-1">
                                  {t.checklistDone?.[i] ? (
                                    <Check className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                                  ) : (
                                    <Circle className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", CYBERPUNK_CLASSES.textMuted)} />
                                  )}
                                  <span
                                    className={
                                      t.checklistDone?.[i]
                                        ? "text-slate-500 line-through"
                                        : CYBERPUNK_CLASSES.textMuted
                                    }
                                  >
                                    {item}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="p-2">
                            {t.status === "fixing" && (
                              <Loader2 className="h-4 w-4 animate-spin inline text-green-400" />
                            )}
                            {t.status !== "fixing" && (
                              <span
                                className={cn(
                                  t.status === "done" && CYBERPUNK_CLASSES.statusSuccess,
                                  t.status === "error" && CYBERPUNK_CLASSES.statusError,
                                  t.status === "pending" && CYBERPUNK_CLASSES.statusPending
                                )}
                              >
                                {t.status}
                              </span>
                            )}
                          </td>
                          <td className={cn("p-2", CYBERPUNK_CLASSES.textMuted)}>
                            <div className="flex flex-col gap-1">
                              <span>{t.changeSummary ?? (t.error ? t.error : "—")}</span>
                              {t.promptSent && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedPromptKey((k) => (k === `${t.lineIndex}-${t.url}` ? null : `${t.lineIndex}-${t.url}`))}
                                  className={cn("text-xs flex items-center gap-0.5 text-green-400 hover:underline", CYBERPUNK_CLASSES.textMuted)}
                                >
                                  {expandedPromptKey === `${t.lineIndex}-${t.url}` ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  {expandedPromptKey === `${t.lineIndex}-${t.url}` ? "Hide prompt" : "View prompt"}
                                </button>
                              )}
                              {expandedPromptKey === `${t.lineIndex}-${t.url}` && t.promptSent && (
                                <pre className="mt-1 p-2 text-[10px] bg-black/40 border border-green-500/30 rounded overflow-auto max-h-48 whitespace-pre-wrap font-mono">
                                  <span className="text-green-400">System:</span>
                                  {"\n"}
                                  {t.promptSent.system}
                                  {"\n\n"}
                                  <span className="text-green-400">User:</span>
                                  {"\n"}
                                  {t.promptSent.user}
                                </pre>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={CYBERPUNK_CLASSES.buttonNeon}
                    onClick={handleExportSheet}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export sheet
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={CYBERPUNK_CLASSES.buttonNeon}
                    onClick={handlePrintSheet}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    Print sheet
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent
          className={cn(
            "max-w-4xl max-h-[80vh] overflow-auto bg-[#0a0a0a] border-2 border-green-500/50",
            CYBERPUNK_CLASSES.textPrimary
          )}
        >
          <DialogHeader className="border-b border-green-500/20 pb-3">
            <DialogTitle className={cn("font-mono", CYBERPUNK_CLASSES.textPrimary)}>
              SEM Task List – Print
            </DialogTitle>
            <DialogDescription className={cn("font-mono text-sm", CYBERPUNK_CLASSES.textMuted)}>
              Print or save as PDF from your browser.
            </DialogDescription>
          </DialogHeader>
          <div className={cn("rounded-md overflow-x-auto border print:block", CYBERPUNK_CLASSES.borderNeon)}>
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className={cn("border-b", CYBERPUNK_CLASSES.borderDivider, CYBERPUNK_CLASSES.bgNeon)}>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">URL</th>
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2 min-w-[200px]">Checklist</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, idx) => (
                  <tr key={`print-${t.lineIndex}-${t.url}-${idx}`} className={cn("border-b", CYBERPUNK_CLASSES.borderDivider)}>
                    <td className="p-2">{t.lineIndex}</td>
                    <td className="p-2 max-w-[200px] truncate" title={t.url}>
                      {t.url}
                    </td>
                    <td className="p-2">{t.suggestedAction}</td>
                    <td className="p-2">
                      <ul className="list-none space-y-0.5 m-0 p-0 text-xs">
                        {(t.checklist ?? []).map((item, i) => (
                          <li key={i} className="flex items-start gap-1">
                            {t.checklistDone?.[i] ? (
                              <Check className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
                            )}
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-2">{t.status}</td>
                    <td className="p-2">
                      {t.changeSummary ?? (t.error ? t.error : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            onClick={() => window.print()}
            className={cn("mt-4", CYBERPUNK_CLASSES.buttonNeon)}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
