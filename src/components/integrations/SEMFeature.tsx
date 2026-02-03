import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wrench, Loader2, Upload, FileText, Download, Printer } from "lucide-react";
import { getStoredSites } from "@/components/integrations/storage";
import type { WordPressSite } from "@/components/integrations/types";
import { interpretSemTaskList, type InterpretedSemTask } from "@/lib/sem-task-interpreter";
import { useContentOptimization } from "@/hooks/use-content-optimization";

export type SemTaskRow = InterpretedSemTask & {
  status: "pending" | "fixing" | "done" | "error";
  changeSummary?: string;
  error?: string;
};

export const SEMFeature: React.FC = () => {
  const sites = getStoredSites();
  const [selectedSite, setSelectedSite] = useState<WordPressSite | null>(null);
  const [rawList, setRawList] = useState("");
  const [tasks, setTasks] = useState<SemTaskRow[]>([]);
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { handleOptimizeContent } = useContentOptimization();

  const [, setGscQueriesForSelection] = useState<any>(null);
  const [, setIsKeywordSelectionOpen] = useState(false);
  const [, setGscClusterAnalysis] = useState<any>(null);
  const [, setIsAnalyzingClusters] = useState(false);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = (reader.result as string) ?? "";
        setRawList(text);
        toast.success("List loaded");
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
    setIsInterpreting(true);
    try {
      const interpreted = await interpretSemTaskList(
        rawList,
        selectedSite?.siteUrl
      );
      setTasks(
        interpreted.map((t) => ({
          ...t,
          status: "pending" as const,
          changeSummary: undefined,
          error: undefined,
        }))
      );
      toast.success(`Interpreted ${interpreted.length} task(s).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Interpretation failed.";
      toast.error(msg);
    } finally {
      setIsInterpreting(false);
    }
  }, [rawList, selectedSite?.siteUrl]);

  const runFixForTask = useCallback(
    async (task: SemTaskRow, site: WordPressSite) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.url === task.url && t.lineIndex === task.lineIndex
            ? { ...t, status: "fixing" as const }
            : t
        )
      );
      try {
        await handleOptimizeContent(
          site,
          task.url,
          "update",
          setGscQueriesForSelection,
          setIsKeywordSelectionOpen,
          setGscClusterAnalysis,
          setIsAnalyzingClusters,
          true,
          {
            optimizeTitle: true,
            optimizeMeta: true,
            optimizeExcerpt: true,
            optimizeContent: true,
          },
          undefined,
          undefined,
          false
        );
        setTasks((prev) =>
          prev.map((t) =>
            t.url === task.url && t.lineIndex === task.lineIndex
              ? { ...t, status: "done" as const, changeSummary: "Optimized" }
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
    [handleOptimizeContent]
  );

  const handleFixIt = useCallback(async () => {
    if (!selectedSite) {
      toast.error("Select a WordPress site first.");
      return;
    }
    const pending = tasks.filter((t) => t.status === "pending");
    if (pending.length === 0) {
      toast.info("No pending tasks to fix.");
      return;
    }
    setIsFixing(true);
    for (const task of pending) {
      await runFixForTask(task, selectedSite);
    }
    setIsFixing(false);
    toast.success(`Fix run complete. ${pending.length} task(s) processed.`);
  }, [selectedSite, tasks, runFixForTask]);

  const handleExportSheet = useCallback(() => {
    const header = "lineIndex,url,suggestedAction,status,changeSummary,error\n";
    const rows = tasks.map(
      (t) =>
        `${t.lineIndex},"${(t.url || "").replace(/"/g, '""')}","${(t.suggestedAction || "").replace(/"/g, '""')}",${t.status},"${(t.changeSummary ?? "").replace(/"/g, '""')}","${(t.error ?? "").replace(/"/g, '""')}"`
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
      <div className="bg-card p-6 rounded-lg border border-border">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              SEM Task List
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a list of URLs or issues; AI interprets and fixes content on
              your WordPress site.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Button
              onClick={handleFixIt}
              variant="outline"
              disabled={
                !selectedSite ||
                pendingCount === 0 ||
                isFixing ||
                !hasTasks
              }
              className="border-primary text-primary hover:bg-primary/10"
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
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">
              WordPress site
            </Label>
            <Select
              value={selectedSite?.id ?? ""}
              onValueChange={(id) => {
                const site = sites.find((s) => s.id === id) ?? null;
                setSelectedSite(site);
              }}
            >
              <SelectTrigger className="mt-1 max-w-xs">
                <SelectValue placeholder="Select site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">
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
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
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
            </div>
            <textarea
              className="mt-2 w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              placeholder="Paste URLs or lines like: https://example.com/page, Fix title and meta"
              value={rawList}
              onChange={(e) => setRawList(e.target.value)}
            />
          </div>

          {hasTasks && (
            <>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">URL</th>
                      <th className="text-left p-2">Action</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t, idx) => (
                      <tr key={`${t.lineIndex}-${t.url}-${idx}`} className="border-b">
                        <td className="p-2">{t.lineIndex}</td>
                        <td className="p-2 max-w-[200px] truncate" title={t.url}>
                          {t.url}
                        </td>
                        <td className="p-2">{t.suggestedAction}</td>
                        <td className="p-2">
                          {t.status === "fixing" && (
                            <Loader2 className="h-4 w-4 animate-spin inline" />
                          )}
                          {t.status !== "fixing" && t.status}
                        </td>
                        <td className="p-2">
                          {t.changeSummary ?? (t.error ? t.error : "—")}
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
                  onClick={handleExportSheet}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export sheet
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrintSheet}
                >
                  <Printer className="h-4 w-4 mr-1" />
                  Print sheet
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>SEM Task List – Print</DialogTitle>
            <DialogDescription>
              Print or save as PDF from your browser.
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-md overflow-x-auto print:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">URL</th>
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, idx) => (
                  <tr key={`print-${t.lineIndex}-${t.url}-${idx}`} className="border-b">
                    <td className="p-2">{t.lineIndex}</td>
                    <td className="p-2 max-w-[200px] truncate" title={t.url}>
                      {t.url}
                    </td>
                    <td className="p-2">{t.suggestedAction}</td>
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
            className="mt-4"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
