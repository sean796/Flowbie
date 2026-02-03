import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress"; // Import Progress
import { FileText, Upload, FolderOpen, Download, Trash2, Star, StarOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { processCSVToChunks, processSingleFile } from "@/lib/file-processing";

export interface StoredFile {
  name: string;
  size: number;
  content: string;
  starred: boolean;
  timestamp: number;
  isProcessing?: boolean; // Optional flag for files being processed (e.g., AI summarization)
}

interface KnowledgeProfile {
  id: string;
  name: string;
  content: string;
}

interface KnowledgeBaseTabProps {
  onFilesUpdate: (files: StoredFile[]) => void;
  onManualContentUpdate: (content: string) => void; // Manual content only
  currentFiles: StoredFile[];
}

const KB_FILES_STORAGE_KEY = "kb_files";

const saveFilesToLocalStorage = (files: StoredFile[]) => {
  try {
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(files));
  } catch (e) {
    console.error("Error saving files to localStorage:", e);
    toast.error("Could not save files to local storage");
  }
};

const CSV_CHUNK_THRESHOLD = 100 * 1024; // 100KB

export const KnowledgeBaseTab: React.FC<KnowledgeBaseTabProps> = ({ 
  onFilesUpdate, 
  onManualContentUpdate, 
  currentFiles
}) => {
  const [activeTab, setActiveTab] = useState("text");
  const [profiles, setProfiles] = useState<KnowledgeProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [newProfileName, setNewProfileName] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [files, setFiles] = useState<StoredFile[]>(currentFiles);
  const [isDragging, setIsDragging] = useState(false);
  // New state for handling processing status
  const [isProcessing, setIsProcessing] = useState(false);
  // New state for progress value
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load profiles and files from localStorage (Initial Load)
  useEffect(() => {
    const storedProfiles = localStorage.getItem("kb_profiles");
    if (storedProfiles) {
      try {
        const parsed = JSON.parse(storedProfiles);
        setProfiles(parsed);
      } catch (e) {
        console.error("Error loading profiles:", e);
      }
    }

    // Since currentFiles is passed in from the parent, we assume parent handles load. 
    // We only need to potentially update internal state if parent passed new files.
    // The parent provides the real source of truth.
    setFiles(currentFiles);
  }, [currentFiles]);

  // Listen for storage changes and custom events to reload files when they're added from other components
  useEffect(() => {
    const loadFilesFromStorage = () => {
      try {
        const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
        const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
        setFiles(storedFiles);
        onFilesUpdate(storedFiles);
      } catch (error) {
        console.error("Error loading files from localStorage:", error);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === KB_FILES_STORAGE_KEY && e.newValue) {
        try {
          const newFiles = JSON.parse(e.newValue) as StoredFile[];
          setFiles(newFiles);
          onFilesUpdate(newFiles);
        } catch (error) {
          console.error("Error parsing files from storage event:", error);
        }
      }
    };

    const handleKBFilesUpdate = (e: CustomEvent) => {
      // Always reload from localStorage to ensure we have the latest data
      loadFilesFromStorage();
    };

    // Load files from localStorage on mount (in case prop is stale)
    loadFilesFromStorage();

    // Listen for storage events (fires when localStorage is changed from other tabs/windows)
    window.addEventListener("storage", handleStorageChange);
    
    // Listen for custom event (fires when files are added from same tab, e.g., IntegrationsTab)
    window.addEventListener("kb-files-updated", handleKBFilesUpdate as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("kb-files-updated", handleKBFilesUpdate as EventListener);
    };
  }, [onFilesUpdate]);

  // Load selected profile content
  useEffect(() => {
    if (selectedProfile) {
      const profile = profiles.find(p => p.id === selectedProfile);
      if (profile) {
        setManualContent(profile.content);
      }
    }
  }, [selectedProfile, profiles]);

  // Notify parent component on content update
  useEffect(() => {
    onManualContentUpdate(manualContent); // Set manual, Index combines
  }, [manualContent, onManualContentUpdate]);

  // Update parent component when files change
  useEffect(() => {
    onFilesUpdate(files);
  }, [files, onFilesUpdate]);

  const saveProfile = useCallback((isNew: boolean) => {
    if (isNew && !newProfileName.trim()) {
      toast.error("Please enter a profile name");
      return;
    }

    if (isNew) {
      const newProfile: KnowledgeProfile = {
        id: `profile-${Date.now()}`,
        name: newProfileName.trim(),
        content: manualContent,
      };
      const updated = [...profiles, newProfile];
      setProfiles(updated);
      localStorage.setItem("kb_profiles", JSON.stringify(updated));
      setSelectedProfile(newProfile.id);
      setNewProfileName("");
      toast.success("Profile saved");
    } else {
      if (!selectedProfile) {
        toast.error("Please select a profile to update");
        return;
      }
      const updated = profiles.map(p =>
        p.id === selectedProfile ? { ...p, content: manualContent } : p
      );
      setProfiles(updated);
      localStorage.setItem("kb_profiles", JSON.stringify(updated));
      toast.success("Profile updated");
    }
  }, [newProfileName, manualContent, profiles, selectedProfile]);

  const clearContent = useCallback(() => {
    setManualContent("");
    toast.success("Content cleared");
  }, []);

  const handleUpload = useCallback(async (fileList: FileList | null) => {
    const uploadedFiles = Array.from(fileList || []);

    if (uploadedFiles.length === 0) return;

    setIsProcessing(true); // Start processing status
    setProgress(0);
    
    const allNewFiles: StoredFile[] = [];
    const totalFiles = uploadedFiles.length;

    for (let i = 0; i < totalFiles; i++) {
      const file = uploadedFiles[i];

      if (file.name.toLowerCase().endsWith(".csv") && file.size > CSV_CHUNK_THRESHOLD) {
        // Large CSV requiring chunking
        const chunks = await processCSVToChunks(file);
        allNewFiles.push(...chunks);
      } else {
        // Other file types or small files
        const singleFile = await processSingleFile(file);
        allNewFiles.push(...singleFile);
      }

      // Update progress after each file is processed
      setProgress(Math.round(((i + 1) / totalFiles) * 100));
    }

    const updatedFiles = [...files, ...allNewFiles];
    setFiles(updatedFiles);
    saveFilesToLocalStorage(updatedFiles);
    toast.success(`${allNewFiles.length} file(s) uploaded (potentially multiple chunks per file)`);
    setIsProcessing(false); // End processing status
    setProgress(0);
  }, [files]);

  const handleFileSelectorChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    await handleUpload(e.target.files);
    // Clear the input value so the same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [handleUpload]);

  const handleDropZoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      await handleUpload(e.dataTransfer.files);
    }
  }, [handleUpload]);

  const toggleStar = useCallback((fileName: string) => {
    const updatedFiles = files.map(f => f.name === fileName ? { ...f, starred: !f.starred } : f);
    setFiles(updatedFiles);
    saveFilesToLocalStorage(updatedFiles);
  }, [files]);

  const downloadFile = useCallback((file: StoredFile) => {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const deleteFile = useCallback((fileName: string) => {
    const updatedFiles = files.filter(f => f.name !== fileName);
    setFiles(updatedFiles);
    saveFilesToLocalStorage(updatedFiles);
    toast.success("File deleted");
  }, [files]);

  const nukeKnowledgeBaseCache = useCallback(() => {
    const fileCount = files.length;

    setFiles([]);
    saveFilesToLocalStorage([]);
    toast.success(`${fileCount > 0 ? fileCount : '0'} Knowledge Base files brutally wiped from cache.`);
  }, [files]);

  const clearUnstarredFiles = useCallback(() => {
    const unstarredFiles = files.filter(f => !f.starred);
    const filesToKeep = files.filter(f => f.starred);
    const fileCount = unstarredFiles.length;

    if (fileCount === 0) return;

    setFiles(filesToKeep);
    saveFilesToLocalStorage(filesToKeep);
    toast.success(`${fileCount} unstarred file(s) cleared.`);
  }, [files]);

  const unstarredCount = files.filter(f => !f.starred).length;
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const formatSize = useCallback((bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  // Use the layout from the Dialog's body
  return (
    <div className="flex flex-col h-full"> 
      {/* The header is handled by the parent BlueprintManagerPanel, but the user wanted the theme adjusted */}
      {/* I will use bg-card/50 theme to match the BlueprintManagerPanel's internal look */}
      <div className="p-6 space-y-4 rounded-lg bg-card/50 border border-border">
          <div className="text-xl font-semibold text-white">Knowledge Base Settings</div>
          <div className="text-sm text-muted-foreground">Manage files and content accessible as context for your agents.</div>
      </div>

      <div className="mt-4 flex-1 flex flex-col bg-card rounded-lg p-6 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 bg-background/50 border border-border/50">
              <TabsTrigger value="text" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <FileText className="w-4 h-4 mr-2" />
                Text Input
              </TabsTrigger>
              <TabsTrigger value="upload" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Upload className="w-4 h-4 mr-2" />
                File Upload
              </TabsTrigger>
              <TabsTrigger value="manager" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <FolderOpen className="w-4 h-4 mr-2" />
                File Manager
              </TabsTrigger>
            </TabsList>

            {/* Text Input Tab */}
            <TabsContent value="text" className="flex-1 pt-4 space-y-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Manage Profiles</span>
                </div>

                <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue placeholder="Select Profile" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {profiles.map(profile => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex gap-2">
                  <Input
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="New profile name"
                    className="flex-1 bg-background border-border"
                  />
                  <Button
                    onClick={() => saveProfile(true)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Save New
                  </Button>
                  <Button
                    onClick={() => saveProfile(false)}
                    disabled={!selectedProfile}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Update Selected
                  </Button>
                </div>

                <Textarea
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  placeholder="Enter your knowledge base content here..."
                  className="min-h-[300px] bg-background border-border text-sm"
                />

                <Button
                  variant="ghost"
                  onClick={clearContent}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Clear Content
                </Button>
              </div>
            </TabsContent>

            {/* File Upload Tab */}
            <TabsContent value="upload" className="flex-1 pt-4 overflow-y-auto">
              <div className="flex items-center justify-center min-h-[400px]">
                <label className="w-full cursor-pointer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelectorChange}
                    className="hidden"
                    accept=".txt,.md,.pdf,.json,.csv"
                  />
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={isProcessing ? undefined : handleDropZoneClick}
                    className={`p-12 rounded-lg transition-colors relative
                      ${isDragging || isProcessing
                        ? 'border-4 border-dashed border-primary bg-primary/20 cursor-default'
                        : 'border-2 border-dashed border-border hover:border-primary/50'
                      }`}
                  >
                    {isProcessing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10 p-4 rounded-lg">
                        <p className="text-primary text-lg font-semibold mb-3">Chunking file(s) into parts...</p>
                        <Progress value={progress} className="w-4/5 h-2" />
                        <p className="text-sm text-muted-foreground mt-2">${progress}% completed</p>
                      </div>
                    )}
                    <div className={`flex flex-col items-center gap-4 ${isProcessing ? 'opacity-30' : ''}`}>
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <Upload className="w-8 h-8 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-medium mb-1">
                          {isDragging ? "Drop Files Here" : "Upload Files"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Drag and drop files here or click to select
                        </p>
                      </div>
                      <Button disabled={isProcessing} className="bg-primary text-primary-foreground hover:bg-primary/90">
                        Select Files
                      </Button>
                    </div>
                  </div>
                </label>
              </div>
            </TabsContent>

            {/* File Manager Tab */}
            <TabsContent value="manager" className="flex-1 pt-4 space-y-4 overflow-y-auto max-h-[60vh]">
              <div className="bg-background/90 p-3 rounded-lg border border-border/50 sticky top-0 z-10">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-xs text-primary">!</span>
                    </div>
                    <span className="text-muted-foreground">Memory Usage</span>
                  </div>
                  <span className="text-sm font-medium">
                    {files.length} files • {formatSize(totalSize)}
                  </span>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  {unstarredCount > 0 && (
                    <Button
                      onClick={clearUnstarredFiles}
                      className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear Temp Files ({unstarredCount})
                    </Button>
                  )}

                  <Button
                    onClick={nukeKnowledgeBaseCache}
                    className="w-full bg-red-800 text-red-100 hover:bg-red-700 mt-2"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear ALL Knowledge Base Files
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {files.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No files uploaded yet</p>
                    <p className="text-xs mt-2">Use the "File Upload" tab to add files.</p>
                  </div>
                ) : (
                  files.map((file) => {
                    // Detect if file is being processed (check for processing flag or progress message in content)
                    const isProcessing = file.isProcessing || (file.content.includes('[AI SUMMARIZATION IN PROGRESS]') || file.content.includes('[SUMMARIZATION IN PROGRESS]'));
                    
                    return (
                    <div
                      key={file.timestamp}
                      className={`flex items-center gap-3 p-3 bg-background/50 border border-border/50 rounded hover:bg-background/80 transition-colors ${isProcessing ? 'border-primary/50 bg-primary/5' : ''}`}
                    >
                      {isProcessing ? (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      ) : (
                        <FileText className="w-5 h-5 text-primary" />
                      )}
                      <span className={`flex-1 text-sm truncate ${isProcessing ? 'text-primary font-medium' : ''}`}>
                        {file.name}
                        {isProcessing && (
                          <span className="ml-2 text-xs text-primary/70 font-normal">(Processing for RAG...)</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatSize(file.size)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStar(file.name)}
                        className="h-8 w-8 p-0"
                      >
                        {file.starred ? (
                          <Star className="w-4 h-4 text-primary fill-primary" />
                        ) : (
                          <StarOff className="w-4 h-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadFile(file)}
                        className="h-8 w-8 p-0 text-primary hover:text-primary"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteFile(file.name)}
                        disabled={file.starred || isProcessing}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    );
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
      </div>
    </div>
  );
};
