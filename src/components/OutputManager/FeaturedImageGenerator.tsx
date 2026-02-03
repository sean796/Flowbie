import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getSavedPrompts, savePrompt as savePromptToStorage, type SavedPrompt } from "@/lib/image-prompt-shortcuts";
import { HexColorPicker } from "react-colorful";
import { Loader2, Download, Copy, Image as ImageIcon, ExternalLink, CheckCircle2, BookmarkPlus, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateImage } from "@/lib/image-api";
import { buildImagePrompt } from "@/lib/image-prompt-builder";
import { downloadImage, copyImageToClipboard } from "./image-utils";
import { FeaturedImageGeneratorProps } from "./types";
import { streamChatCompletion, Message } from "@/lib/api";
import { buildImageChecklistSystemPrompt, buildImageChecklistUserPrompt, ImageChecklistItem } from "@/lib/image-checklist-builder";
import { parseMarkdownSections, MarkdownSection } from "@/lib/section-parser";
import { insertContentIntoSection } from "@/lib/section-parser";
import { generateSEOImageFilename } from "@/lib/image-filename-generator";

export interface FeaturedImageGeneratorState {
  generatedImageUrl: string | null;
  generatedImageBase64: string | null;
  previewImageUrl: string | null;
  selectedSection?: string | null;
}

export const FeaturedImageGenerator = ({
  apiKey = "",
  flowTitle = "",
  flowPurpose = "",
  agents = [],
  finalOutput = "",
  selectedModel = "google/gemini-3-flash-preview",
  temperature = 1.57,
  maxTokens = 5000000,
  topP = 0.90,
  setGenerationResult,
  onImageStateChange,
}: FeaturedImageGeneratorProps & { onImageStateChange?: (state: FeaturedImageGeneratorState) => void }) => {
  const [userPrompt, setUserPrompt] = useState("");
  const [imageSourceMode, setImageSourceMode] = useState<'featured' | 'section'>('featured');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [includeText, setIncludeText] = useState(false);
  const [includePeople, setIncludePeople] = useState(false);
  const [includeAnimals, setIncludeAnimals] = useState(false);
  const [includeCars, setIncludeCars] = useState(false);
  const [isInfographic, setIsInfographic] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:19'>('1:1');
  const [style, setStyle] = useState<'professional' | 'minimalist' | 'abstract' | 'modern' | 'classic'>('professional');
  const [colorScheme, setColorScheme] = useState<'vibrant' | 'muted' | 'monochrome' | 'warm' | 'cool' | 'natural'>('vibrant');
  const [colorForeground, setColorForeground] = useState<string>("");
  const [colorBackground, setColorBackground] = useState<string>("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatedImageBase64, setGeneratedImageBase64] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
  const [imageChecklist, setImageChecklist] = useState<ImageChecklistItem[]>([]);
  const [hasGeneratedChecklist, setHasGeneratedChecklist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageModel, setImageModel] = useState<string>('google/gemini-3-pro-image-preview');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState("");

  // Load saved prompts from storage
  useEffect(() => {
    setSavedPrompts(getSavedPrompts());
  }, []);

  const handleInsertShortcut = useCallback((content: string) => {
    setUserPrompt((prev) =>
      prev.trim() ? prev.trimEnd() + "\n\n" + content : content
    );
    toast.success("Prompt inserted");
  }, []);

  const handleSaveCurrent = useCallback(() => {
    if (!userPrompt.trim()) {
      toast.error("Nothing to save");
      return;
    }
    setSaveDialogName("");
    setSaveDialogOpen(true);
  }, [userPrompt]);

  const handleConfirmSave = useCallback(() => {
    const name = saveDialogName.trim() || "Custom prompt";
    const prompt: SavedPrompt = {
      id: crypto.randomUUID(),
      name,
      content: userPrompt.trim(),
    };
    savePromptToStorage(prompt);
    setSavedPrompts(getSavedPrompts());
    setSaveDialogOpen(false);
    setSaveDialogName("");
    toast.success("Prompt saved");
  }, [saveDialogName, userPrompt]);

  // Parse sections from finalOutput
  const availableSections = useMemo(() => {
    if (!finalOutput) return [];
    return parseMarkdownSections(finalOutput);
  }, [finalOutput]);

  // Color input field component
  const ColorInputField = ({ 
    label, 
    value, 
    onChange 
  }: { 
    label: string; 
    value: string; 
    onChange: (color: string) => void;
  }) => {
    const [inputValue, setInputValue] = useState(value);
    const [isOpen, setIsOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    
    // Regex to validate hex color code
    const isHexColor = (hex: string) => /^\s*#?([0-9a-fA-F]{3}([0-9a-fA-F]{3})?)\s*$/.test(hex.trim());

    useEffect(() => {
      setInputValue(value);
    }, [value]);

    const handleColorChange = useCallback((newColor: string) => {
      onChange(newColor);
      setInputValue(newColor);
    }, [onChange]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    }, []);

    const handleInputBlur = useCallback(() => {
      let newColor = inputValue.trim();

      if (newColor.length > 0 && !newColor.startsWith("#")) {
        newColor = "#" + newColor;
      }

      if (isHexColor(newColor) && (newColor.length === 4 || newColor.length === 7)) {
        const normalizedColor = newColor.toLowerCase();
        onChange(normalizedColor);
        setInputValue(normalizedColor);
      } else {
        setInputValue(value || "");
      }
    }, [inputValue, value, onChange]);

    const displayValue = value || "#000000";
    const displayText = value || "Click to pick color";

    return (
      <div className="space-y-2">
        <Label className="text-foreground text-sm">{label}</Label>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal h-10"
              disabled={isGenerating}
            >
              <div className="flex items-center space-x-2 w-full">
                <div
                  className={cn("h-4 w-4 rounded border flex-shrink-0")}
                  style={{ backgroundColor: displayValue }}
                />
                <span className="truncate text-sm">{displayText}</span>
              </div>
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-auto p-0" 
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => {
              // Check if the click is inside our content area
              const target = e.target as HTMLElement;
              if (contentRef.current?.contains(target)) {
                e.preventDefault();
                return;
              }
              // Also check for react-colorful elements (they might be in a portal)
              const reactColorfulElement = document.querySelector('.react-colorful');
              if (reactColorfulElement && reactColorfulElement.contains(target)) {
                e.preventDefault();
              }
            }}
          >
            <div 
              ref={contentRef}
              className="p-4 flex flex-col space-y-4"
              onPointerDown={(e) => {
                // Prevent the pointer down from closing the popover
                e.stopPropagation();
              }}
            >
              <div onPointerDown={(e) => e.stopPropagation()}>
                <HexColorPicker color={displayValue} onChange={handleColorChange} />
              </div>
              <Input
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                placeholder="#RRGGBB or #RGB"
                className="text-center font-mono text-sm h-8"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  };

  // Clear selected section when switching back to featured mode
  useEffect(() => {
    if (imageSourceMode === 'featured') {
      setSelectedSection(null);
    }
  }, [imageSourceMode]);

  // Debug logging and notify parent of image state changes
  useEffect(() => {
    if (generatedImageUrl || generatedImageBase64) {
      console.log('Image state updated - URL:', generatedImageUrl ? 'Set' : 'null', 'Base64:', generatedImageBase64 ? 'Set' : 'null');
    }
    if (onImageStateChange) {
      onImageStateChange({
        generatedImageUrl,
        generatedImageBase64,
        previewImageUrl,
        selectedSection: imageSourceMode === 'section' ? selectedSection : null,
      });
    }
  }, [generatedImageUrl, generatedImageBase64, previewImageUrl, imageSourceMode, selectedSection, onImageStateChange]);

  const handleGenerateChecklist = async () => {
    if (!apiKey) {
      toast.error("Please set your OpenRouter API key in Settings.");
      return;
    }

    // Allow generation even without section selection - will use user prompt and options
    // If in section mode but no section selected, fall back to featured mode behavior
    const effectiveMode = (imageSourceMode === 'section' && !selectedSection) ? 'featured' : imageSourceMode;

    setIsGeneratingChecklist(true);
    setError(null);
    setImageChecklist([]);

    try {
      // Get selected section object if in section mode
      const selectedSectionObj = effectiveMode === 'section' && selectedSection
        ? availableSections.find(s => s.header === selectedSection)
        : undefined;

      // #region agent log
      if (selectedSectionObj) {
        fetch('http://127.0.0.1:7260/ingest/b991f7d7-41bc-4d2b-b6c2-f5dd1819982c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FeaturedImageGenerator.tsx:handleGenerateChecklist',message:'Selected section for checklist',data:{header:selectedSectionObj.header,fullTextPreview:selectedSectionObj.fullText?.slice(0,600),hasInfoGraphic:selectedSectionObj.fullText?.includes('[INFOGRAPHIC]'),hasBrandColors:selectedSectionObj.fullText?.includes('BRAND COLORS'),flowPurpose:flowPurpose?.slice(0,100)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
      }
      // #endregion
      const systemPrompt = buildImageChecklistSystemPrompt(
        flowTitle, 
        flowPurpose, 
        effectiveMode === 'featured' ? finalOutput : undefined,
        selectedSectionObj,
        userPrompt.trim() || undefined
      );
      const userPromptText = buildImageChecklistUserPrompt({
        flowTitle,
        flowPurpose,
        agents,
        finalOutput: effectiveMode === 'featured' ? finalOutput : undefined,
        selectedSection: selectedSectionObj,
        userPrompt: userPrompt.trim() || undefined,
        includeText,
        includePeople,
        includeAnimals,
        includeCars,
        isInfographic,
        aspectRatio,
        style,
        colorScheme,
        colorForeground: colorForeground.trim() || undefined,
        colorBackground: colorBackground.trim() || undefined,
      });

      let checklistContent = "";
      await streamChatCompletion({
        apiKey,
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPromptText }
        ],
        temperature,
        maxTokens,
        topP,
        onContentChunk: (chunk) => {
          checklistContent += chunk;
        }
      });

      // Parse checklist from response - looking for title/description format
      // Expected format: Title on one line, blank line, description starting with "I'm" on next line(s)
      const lines = checklistContent.split('\n').map(line => line.trim());
      const parsedItems: ImageChecklistItem[] = [];
      let currentTitle: string | null = null;
      let currentDescription: string[] = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];
        
        // Skip empty lines - they separate title from description or items from each other
        if (!line) {
          // If we have both title and description, save the item
          if (currentTitle && currentDescription.length > 0) {
            parsedItems.push({
              title: currentTitle,
              description: currentDescription.join(' ')
            });
            currentTitle = null;
            currentDescription = [];
          }
          i++;
          continue;
        }

        // Check if this line is a title (not starting with "I'm"/"I am", typically shorter, capitalized)
        const isTitleCandidate = line.length < 120 && 
                                 line.length > 3 &&
                                 !line.startsWith("I'm") && 
                                 !line.startsWith("I am") &&
                                 !line.startsWith("I'm currently") &&
                                 !line.startsWith("I'm now") &&
                                 !line.match(/^[a-z]/); // Starts with capital

        // Check if this line is a description (starts with "I'm" or "I am")
        const isDescription = line.startsWith("I'm") || 
                              line.startsWith("I am") ||
                              line.startsWith("I'm currently") ||
                              line.startsWith("I'm now");

        if (isTitleCandidate && !currentTitle) {
          // Look ahead to see if next non-empty line is a description
          let j = i + 1;
          while (j < lines.length && !lines[j]) j++;
          
          if (j < lines.length && 
              (lines[j].startsWith("I'm") || lines[j].startsWith("I am"))) {
            // This is a title, next line is description
            currentTitle = line;
            i = j; // Move to description line
            continue;
          } else if (j < lines.length && lines[j].length > 50) {
            // Next line is long, might be description without "I'm"
            currentTitle = line;
            i = j;
            continue;
          }
        }

        // If we have a title and this is a description, add it
        if (currentTitle && (isDescription || (currentDescription.length > 0 && line.length > 20))) {
          if (isDescription || currentDescription.length > 0) {
            currentDescription.push(line);
          }
        } else if (currentTitle && currentDescription.length > 0) {
          // We have a complete item, but this line doesn't continue the description
          // Check if it's a new title
          if (isTitleCandidate) {
            // Save current item and start new one
            parsedItems.push({
              title: currentTitle,
              description: currentDescription.join(' ')
            });
            currentTitle = line;
            currentDescription = [];
          } else {
            // Might be continuation of description
            currentDescription.push(line);
          }
        } else if (!currentTitle && isTitleCandidate) {
          // Start new item
          currentTitle = line;
        }

        i++;
      }

      // Save last item if exists
      if (currentTitle) {
        parsedItems.push({
          title: currentTitle,
          description: currentDescription.length > 0 
            ? currentDescription.join(' ') 
            : "Processing image requirements based on content and specifications."
        });
      }

      // Fallback parsing if structured format not found
      if (parsedItems.length === 0) {
        // Try pattern: Title (non-empty, not starting with I'm) followed by description (starts with I'm)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          
          // Look for title pattern
          if (line.length < 100 && line.length > 5 && 
              line[0] === line[0].toUpperCase() && 
              !line.startsWith("I'm") && !line.startsWith("I am")) {
            // Find next non-empty line as description
            let j = i + 1;
            while (j < lines.length && !lines[j]) j++;
            
            if (j < lines.length) {
              const descLine = lines[j];
              if (descLine.startsWith("I'm") || descLine.startsWith("I am") || descLine.length > 30) {
                parsedItems.push({
                  title: line,
                  description: descLine
                });
                i = j; // Skip description
              }
            }
          }
        }
      }

      // Final fallback: create simple items from numbered/bulleted list or any substantial lines
      if (parsedItems.length === 0) {
        const simpleItems: ImageChecklistItem[] = [];
        const numberedItems = checklistContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => /^\d+[\.\)]\s+/.test(line) || /^[-*]\s+/.test(line));
        
        if (numberedItems.length > 0) {
          numberedItems.forEach(line => {
            const text = line.replace(/^\d+[\.\)]\s+/, '').replace(/^[-*]\s+/, '').trim();
            if (text.length > 0) {
              simpleItems.push({
                title: text.length > 60 ? text.substring(0, 60) + '...' : text,
                description: text
              });
            }
          });
        }
        
        if (simpleItems.length > 0) {
          setImageChecklist(simpleItems);
        } else {
          setImageChecklist([{
            title: "Image Generation Requirements",
            description: "Generate image based on content and user preferences."
          }]);
        }
      } else {
        setImageChecklist(parsedItems);
      }

      setHasGeneratedChecklist(true);
      toast.success("Image checklist generated!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate checklist";
      setError(errorMessage);
      toast.error(`Checklist generation failed: ${errorMessage}`);
    } finally {
      setIsGeneratingChecklist(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!apiKey) {
      toast.error("Please set your OpenRouter API key in Settings.");
      return;
    }

    // Allow generation even without section selection - will use user prompt and options
    // If in section mode but no section selected, fall back to featured mode behavior
    const effectiveMode = (imageSourceMode === 'section' && !selectedSection) ? 'featured' : imageSourceMode;

    // If no checklist exists, generate one first
    if (!hasGeneratedChecklist || imageChecklist.length === 0) {
      await handleGenerateChecklist();
      if (imageChecklist.length === 0) {
        return; // Wait for checklist to be generated
      }
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedImageUrl(null);
    setGeneratedImageBase64(null);

    try {
      // Get selected section object if in section mode
      const selectedSectionObj = effectiveMode === 'section' && selectedSection
        ? availableSections.find(s => s.header === selectedSection)
        : undefined;

      const checklistText = imageChecklist.length > 0 
        ? `\n\nImage Generation Checklist:\n${imageChecklist.map((item, idx) => `${idx + 1}. ${item.title}\n   ${item.description}`).join('\n')}`
        : '';

      const basePrompt = buildImagePrompt(
        {
          flowTitle,
          flowPurpose,
          agents,
          finalOutput: effectiveMode === 'featured' ? finalOutput : undefined,
          selectedSection: selectedSectionObj,
        },
        {
          userPrompt: userPrompt.trim() || undefined,
          includeText,
          includePeople,
          includeAnimals,
          includeCars,
          isInfographic,
          aspectRatio,
          style,
          colorScheme,
          colorForeground: colorForeground.trim() || undefined,
          colorBackground: colorBackground.trim() || undefined,
        }
      );

      const prompt = basePrompt + checklistText + '\n\nFollow the checklist above EXACTLY. Ensure all requirements are met, especially regarding what should and should NOT be included.';

      // Generate image
      const result = await generateImage({
        apiKey,
        prompt,
        model: imageModel,
        aspectRatio,
      });

      if (result.error) {
        setError(result.error);
        toast.error(`Image generation failed: ${result.error}`);
      } else if (result.imageUrl) {
        try {
console.log('Received imageUrl from API:', result.imageUrl, 'Type:', typeof result.imageUrl);
          
          // Ensure imageUrl is a string - handle various formats
          let imageUrl: string;
          if (typeof result.imageUrl === 'string') {
            imageUrl = result.imageUrl;
} else if (result.imageUrl && typeof result.imageUrl === 'object') {
            // If it's an object, try to extract the URL from common properties
            imageUrl = result.imageUrl.url || result.imageUrl.image_url || result.imageUrl.href;
if (!imageUrl) {
              console.error('Could not extract URL from object:', result.imageUrl);
              throw new Error('Image URL is an object but no URL property found');
            }
            console.warn('Image URL was an object, extracted:', imageUrl.substring(0, 100));
          } else {
            imageUrl = String(result.imageUrl);
}
          
          // Validate it's actually a URL string
          if (!imageUrl || typeof imageUrl !== 'string') {
            console.error('Invalid image URL after processing:', imageUrl, 'Original:', result.imageUrl);
            throw new Error('Invalid image URL format received');
          }
          
          // Additional validation - should start with http or data:
          if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
            console.warn('Image URL does not start with http or data:', imageUrl.substring(0, 50));
          }
// CRITICAL FIX: If the extracted URL is a data: URL, treat it as base64 instead
          if (imageUrl.startsWith('data:')) {
console.log('Data URL detected, treating as base64:', imageUrl.substring(0, 100));
            setError(null);
            setGeneratedImageUrl(null); // Clear URL if base64 is set
            const imageBase64 = imageUrl; // Already in data: format
            setGeneratedImageBase64(imageBase64);
            setPreviewImageUrl(imageBase64); // Use data URL directly for preview
toast.success("Image generated successfully!");
            return; // Exit early - don't try to fetch data URLs
          }
          
          // Regular HTTP/HTTPS URL handling
          console.log('Setting image URL (final):', imageUrl.substring(0, 100));
          setError(null); // Clear any previous errors
          setGeneratedImageBase64(null); // Clear base64 if URL is set
          setGeneratedImageUrl(imageUrl);
          
          // Convert URL to blob for preview to avoid CORS issues
fetch(imageUrl)
            .then(res => {
return res.blob();
            })
            .then(blob => {
const blobUrl = URL.createObjectURL(blob);
              setPreviewImageUrl(blobUrl);
console.log('Created blob URL for preview');
            })
            .catch(err => {
console.warn('Failed to create blob URL, using original URL:', err);
              setPreviewImageUrl(imageUrl); // Fallback to original URL
});
          
          toast.success("Image generated successfully!");
        } catch (err) {
console.error('Error setting image URL:', err);
          setError('Failed to set image URL');
        }
      } else if (result.imageBase64) {
        try {
          console.log('Setting image base64 (length):', result.imageBase64?.length || 0);
          setError(null); // Clear any previous errors
          setGeneratedImageUrl(null); // Clear URL if base64 is set
          const imageBase64 = String(result.imageBase64);
          setGeneratedImageBase64(imageBase64);
          
          // Ensure base64 has proper data URL format
          const base64Url = imageBase64.startsWith('data:') 
            ? imageBase64 
            : `data:image/png;base64,${imageBase64}`;
          setPreviewImageUrl(base64Url);
          
          toast.success("Image generated successfully!");
        } catch (err) {
          console.error('Error setting image base64:', err);
          setError('Failed to set image base64');
        }
      } else {
        throw new Error("No image data received");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate image";
      setError(errorMessage);
      toast.error(`Image generation failed: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    try {
      let filename: string;
      
      // Generate SEO-optimized filename based on source mode
      if (imageSourceMode === 'section' && selectedSection) {
        // Section-based image: generate from section name
        filename = await generateSEOImageFilename(
          selectedSection,
          apiKey,
          selectedModel,
          'section'
        );
      } else {
        // Featured image: generate from blog title
        const sourceText = flowTitle || 'featured-image';
        filename = await generateSEOImageFilename(
          sourceText,
          apiKey,
          selectedModel,
          'featured'
        );
      }
      
      await downloadImage(generatedImageUrl || undefined, generatedImageBase64 || undefined, filename);
      toast.success("Image downloaded successfully!");
    } catch (err) {
      toast.error("Failed to download image");
      console.error("Download error:", err);
    }
  };

  const handleCopy = async () => {
    try {
      await copyImageToClipboard(generatedImageUrl || undefined, generatedImageBase64 || undefined);
      toast.success("Image copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy image to clipboard");
      console.error("Copy error:", err);
    }
  };

  // Use preview URL if available, otherwise fallback to original
  const imageDisplayUrl = previewImageUrl || generatedImageUrl || generatedImageBase64;
  
  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewImageUrl && previewImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [previewImageUrl]);

  return (
    <div className="flex flex-col h-full p-6 space-y-4">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Image Generator</h2>
          <p className="text-sm text-muted-foreground">
            Generate an image based on your blueprint. Choose to create a featured image from the full content, or select a specific section to use as inspiration.
          </p>
        </div>

        {/* Image Source Selection */}
        <div className="space-y-2">
          <Label className="text-foreground text-sm">Image Source:</Label>
          <RadioGroup
            value={imageSourceMode}
            onValueChange={(value) => setImageSourceMode(value as 'featured' | 'section')}
            disabled={isGenerating || isGeneratingChecklist}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="featured" id="source-featured" />
              <Label htmlFor="source-featured" className="text-foreground font-normal cursor-pointer text-sm">
                Featured Image (uses full content)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="section" id="source-section" />
              <Label htmlFor="source-section" className="text-foreground font-normal cursor-pointer text-sm">
                Specific Section (select a section from the report)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Section Selection Dropdown */}
        {imageSourceMode === 'section' && (
          <div className="space-y-2">
            <Label htmlFor="section-select" className="text-foreground text-sm">
              Select Section:
            </Label>
            <Select
              value={selectedSection || ""}
              onValueChange={(value) => setSelectedSection(value)}
              disabled={isGenerating || isGeneratingChecklist || availableSections.length === 0}
            >
              <SelectTrigger id="section-select" className="bg-background text-foreground">
                <SelectValue placeholder={availableSections.length === 0 ? "No sections available" : "Choose a section..."} />
              </SelectTrigger>
              <SelectContent>
                {availableSections.map((section, index) => (
                  <SelectItem key={index} value={section.header}>
                    {section.header}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSection && (
              <p className="text-xs text-muted-foreground">
                Image will be generated based on the "{selectedSection}" section.
              </p>
            )}
          </div>
        )}

        {/* Optional Prompt Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="image-prompt" className="text-foreground text-sm">
              Optional Prompt
            </Label>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={isGenerating || savedPrompts.length === 0}
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                    Insert shortcut
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  {savedPrompts.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onSelect={() => handleInsertShortcut(p.content)}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={isGenerating}
                onClick={handleSaveCurrent}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                Save current
              </Button>
            </div>
          </div>
          <Textarea
            id="image-prompt"
            placeholder="Describe how you'd like the image to look (e.g., 'modern and professional', 'colorful and vibrant')..."
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            className="min-h-[80px] bg-background text-foreground text-sm"
            disabled={isGenerating}
          />
          <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save prompt as shortcut</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="shortcut-name" className="text-sm">
                  Name
                </Label>
                <Input
                  id="shortcut-name"
                  placeholder="e.g. Neo Digital Style"
                  value={saveDialogName}
                  onChange={(e) => setSaveDialogName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConfirmSave()}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmSave}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Content Options */}
        <div className="space-y-2">
          <Label className="text-foreground text-sm">Include in Image:</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-text"
                checked={includeText}
                onCheckedChange={(checked) => setIncludeText(checked === true)}
                disabled={isGenerating}
              />
              <Label
                htmlFor="include-text"
                className="text-foreground font-normal cursor-pointer text-sm"
              >
                Text elements
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-people"
                checked={includePeople}
                onCheckedChange={(checked) => setIncludePeople(checked === true)}
                disabled={isGenerating}
              />
              <Label
                htmlFor="include-people"
                className="text-foreground font-normal cursor-pointer text-sm"
              >
                People
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-animals"
                checked={includeAnimals}
                onCheckedChange={(checked) => setIncludeAnimals(checked === true)}
                disabled={isGenerating}
              />
              <Label
                htmlFor="include-animals"
                className="text-foreground font-normal cursor-pointer text-sm"
              >
                Animals
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-cars"
                checked={includeCars}
                onCheckedChange={(checked) => setIncludeCars(checked === true)}
                disabled={isGenerating}
              />
              <Label
                htmlFor="include-cars"
                className="text-foreground font-normal cursor-pointer text-sm"
              >
                Vehicles
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is-infographic"
                checked={isInfographic}
                onCheckedChange={(checked) => setIsInfographic(checked === true)}
                disabled={isGenerating}
              />
              <Label
                htmlFor="is-infographic"
                className="text-foreground font-normal cursor-pointer text-sm"
              >
                Infographic
              </Label>
            </div>
          </div>
        </div>

        {/* Image Settings */}
        <div className="space-y-3">
          <Label className="text-foreground text-sm font-medium">Image Settings</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="aspect-ratio" className="text-foreground text-sm">
                Aspect Ratio
              </Label>
              <Select
                value={aspectRatio}
                onValueChange={(value: typeof aspectRatio) => setAspectRatio(value)}
                disabled={isGenerating}
              >
                <SelectTrigger id="aspect-ratio" className="bg-background text-foreground h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">1:1 (Square)</SelectItem>
                  <SelectItem value="16:9">16:9 (Widescreen)</SelectItem>
                  <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                  <SelectItem value="9:19">9:19 (Tall Phone)</SelectItem>
                  <SelectItem value="4:3">4:3 (Standard)</SelectItem>
                  <SelectItem value="3:4">3:4 (Portrait Standard)</SelectItem>
                  <SelectItem value="21:9">21:9 (Ultrawide)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="style" className="text-foreground text-sm">
                Style
              </Label>
              <Select
                value={style}
                onValueChange={(value: typeof style) => setStyle(value)}
                disabled={isGenerating}
              >
                <SelectTrigger id="style" className="bg-background text-foreground h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="minimalist">Minimalist</SelectItem>
                  <SelectItem value="abstract">Abstract</SelectItem>
                  <SelectItem value="modern">Modern</SelectItem>
                  <SelectItem value="classic">Classic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="color-scheme" className="text-foreground text-sm">
                Color Scheme
              </Label>
              <Select
                value={colorScheme}
                onValueChange={(value: typeof colorScheme) => setColorScheme(value)}
                disabled={isGenerating}
              >
                <SelectTrigger id="color-scheme" className="bg-background text-foreground h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vibrant">Vibrant</SelectItem>
                  <SelectItem value="muted">Muted</SelectItem>
                  <SelectItem value="monochrome">Monochrome</SelectItem>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="cool">Cool</SelectItem>
                  <SelectItem value="natural">Natural</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Color Foreground and Background */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <ColorInputField
              label="Color Foreground"
              value={colorForeground}
              onChange={setColorForeground}
            />
            <ColorInputField
              label="Color Background"
              value={colorBackground}
              onChange={setColorBackground}
            />
          </div>
          
          {/* Image Model Selector */}
          <div className="space-y-2 pt-3 border-t border-border">
            <Label htmlFor="image-model-settings" className="text-foreground text-sm font-medium">
              Image Model:
            </Label>
            <div className="flex gap-2">
              <Select
                value={isCustomModel ? "custom" : imageModel}
                onValueChange={(value) => {
                  if (value === "custom") {
                    setIsCustomModel(true);
                  } else {
                    setIsCustomModel(false);
                    setImageModel(value);
                  }
                }}
                disabled={isGenerating || isGeneratingChecklist}
              >
                <SelectTrigger id="image-model-settings" className="bg-background text-foreground h-10 flex-1">
                  <SelectValue placeholder="Select image model..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google/gemini-3-pro-image-preview">Gemini 3 Pro Image Preview</SelectItem>
                  <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="black-forest-labs/flux.2-klein-4b">Flux.2 Klein 4B</SelectItem>
                  <SelectItem value="custom">Enter Custom Model...</SelectItem>
                </SelectContent>
              </Select>
              {isCustomModel && (
                <Input
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  placeholder="e.g., black-forest-labs/flux.2-klein-4b"
                  className="bg-background text-foreground flex-1"
                  disabled={isGenerating || isGeneratingChecklist}
                />
              )}
            </div>
            {imageModel && (
              <p className="text-xs text-muted-foreground">
                Using model: <span className="font-mono">{imageModel}</span>
              </p>
            )}
          </div>
        </div>

        {/* Generate Checklist Button */}
        {!hasGeneratedChecklist && (
          <Button
            onClick={handleGenerateChecklist}
            disabled={isGeneratingChecklist || !apiKey}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isGeneratingChecklist ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Checklist...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Generate Image Checklist
              </>
            )}
          </Button>
        )}

        {/* Checklist Display */}
        {hasGeneratedChecklist && imageChecklist.length > 0 && (
          <div className="space-y-4 p-4 bg-background border border-border rounded-md">
            <Label className="text-foreground font-semibold text-base">Image Generation Checklist:</Label>
            <div className="space-y-4">
              {imageChecklist.map((item, index) => (
                <div key={index} className="space-y-2 pb-3 border-b border-border last:border-b-0 last:pb-0">
                  <h4 className="text-sm font-semibold text-foreground leading-tight">
                    {item.title}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed pl-2">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateChecklist}
                disabled={isGeneratingChecklist || !apiKey}
                className="flex-1"
              >
                {isGeneratingChecklist ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  "Regenerate Checklist"
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Generate Image Button */}
        <Button
          onClick={handleGenerateImage}
          disabled={isGenerating || !apiKey || (!hasGeneratedChecklist && !isGeneratingChecklist)}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Image...
            </>
          ) : (
            <>
              <ImageIcon className="mr-2 h-4 w-4" />
              Generate Image
            </>
          )}
        </Button>

        {!apiKey && (
          <p className="text-sm text-muted-foreground">
            Please set your OpenRouter API key in Settings to generate images.
          </p>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Generated Image Preview */}
        {imageDisplayUrl && (
          <div className="space-y-4 p-4 bg-background border border-border rounded-md">
            <Label className="text-foreground font-semibold text-base">Generated Image:</Label>
            <div className="relative rounded-md overflow-hidden bg-muted flex items-center justify-center">
              <img
                src={imageDisplayUrl.startsWith('data:') ? imageDisplayUrl : (imageDisplayUrl.startsWith('http') ? imageDisplayUrl : `data:image/png;base64,${imageDisplayUrl}`)}
                alt="Generated infographic"
                className="max-w-full max-h-[600px] object-contain"
                onError={(e) => {
                  console.error('Image failed to load:', e);
                  setError('Failed to display generated image');
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="flex-1"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="flex-1"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy to Clipboard
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

