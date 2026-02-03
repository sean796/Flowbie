import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Copy, Image as ImageIcon, ExternalLink, FileImage } from "lucide-react";
import { toast } from "sonner";
import { downloadImage, copyImageToClipboard } from "./image-utils";
import { MarkdownSection } from "@/lib/section-parser";

interface ImagePreviewPanelProps {
  generatedImageUrl: string | null;
  generatedImageBase64: string | null;
  previewImageUrl: string | null;
  onDownload: () => void;
  onCopy: () => void;
  availableSections?: MarkdownSection[];
  defaultSection?: string | null;
  onInsertImage?: (sectionHeader: string, imageMarkdown: string) => void;
  finalOutput?: string;
}

export const ImagePreviewPanel = ({
  generatedImageUrl,
  generatedImageBase64,
  previewImageUrl,
  onDownload,
  onCopy,
  availableSections = [],
  defaultSection = null,
  onInsertImage,
  finalOutput,
}: ImagePreviewPanelProps) => {
  // Compute display URL with proper data URL prefix for base64
  const imageDisplayUrl = (() => {
    if (previewImageUrl) return previewImageUrl;
    if (generatedImageUrl) return generatedImageUrl;
    if (generatedImageBase64) {
      // Ensure base64 has proper data URL format
      return generatedImageBase64.startsWith('data:') 
        ? generatedImageBase64 
        : `data:image/png;base64,${generatedImageBase64}`;
    }
    return null;
  })();
  const [selectedInsertSection, setSelectedInsertSection] = useState<string | null>(defaultSection || null);

  // Update selected section when defaultSection changes
  useEffect(() => {
    if (defaultSection) {
      setSelectedInsertSection(defaultSection);
    }
  }, [defaultSection]);

  // Convert image to blob URL for markdown embedding
  const convertToBlobUrl = async (source: string): Promise<string | null> => {
    try {
      let blob: Blob;
      
      // If source is already a blob URL, use it directly
      if (source.startsWith('blob:')) {
        return source;
      }
      
      // If source is a data URL (base64), fetch it to get blob
      if (source.startsWith('data:')) {
        const response = await fetch(source);
        blob = await response.blob();
      } else {
        // For http/https URLs, fetch and get blob
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error('Failed to fetch image');
        }
        blob = await response.blob();
      }
      
      // Create blob URL
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Error converting to blob URL:', error);
      return null;
    }
  };

  // Format image as markdown (use blob URL instead of base64)
  const formatImageAsMarkdown = async (): Promise<string> => {
    let imageSource: string | null = null;
    
    // Prefer previewImageUrl if it's already a blob URL
    if (previewImageUrl && previewImageUrl.startsWith('blob:')) {
      imageSource = previewImageUrl;
    } else if (generatedImageBase64) {
      // Convert base64 to blob URL
      const base64String = generatedImageBase64.startsWith('data:') 
        ? generatedImageBase64 
        : `data:image/png;base64,${generatedImageBase64}`;
      imageSource = await convertToBlobUrl(base64String);
    } else if (generatedImageUrl) {
      // Convert URL to blob URL
      imageSource = await convertToBlobUrl(generatedImageUrl);
    } else if (previewImageUrl) {
      // Use previewImageUrl even if not blob (fallback)
      imageSource = previewImageUrl;
    }
    
    if (!imageSource) return '';
    
    // Create alt text from section name or generic
    const altText = selectedInsertSection || 'Generated image';
    
    // Return proper markdown image syntax with blob URL
    return `![${altText}](${imageSource})`;
  };

  const handleInsertImage = async () => {
    if (!selectedInsertSection) {
      toast.error("Please select a section to insert the image into.");
      return;
    }

    if (!onInsertImage) {
      toast.error("Insert image functionality not available.");
      return;
    }

    // Show loading toast
    const loadingToast = toast.loading("Preparing image for insertion...");

    try {
      const imageMarkdown = await formatImageAsMarkdown();
      if (!imageMarkdown) {
        toast.error("No image available to insert.");
        toast.dismiss(loadingToast);
        return;
      }

      onInsertImage(selectedInsertSection, imageMarkdown);
      toast.dismiss(loadingToast);
    } catch (error) {
      console.error('Error formatting image:', error);
      toast.error("Failed to prepare image for insertion.");
      toast.dismiss(loadingToast);
    }
  };

  if (!imageDisplayUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <ImageIcon className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          No image generated yet. Generate an image to see the preview here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4">
      {/* Image URL/Base64 Display */}
      {(generatedImageUrl || generatedImageBase64) && (
        <div className="space-y-2">
          <Label className="text-foreground">Image URL:</Label>
          <div className="flex items-center gap-2 p-3 bg-background border border-border rounded-md">
            <div className="flex-1 text-sm text-muted-foreground break-all">
              {generatedImageUrl ? (
                generatedImageUrl.length > 80 
                  ? `${generatedImageUrl.substring(0, 80)}...` 
                  : generatedImageUrl
              ) : generatedImageBase64 ? (
                generatedImageBase64.length > 80
                  ? `${generatedImageBase64.substring(0, 80)}...`
                  : generatedImageBase64
              ) : 'No URL available'}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const urlToCopy = generatedImageUrl || generatedImageBase64;
                if (urlToCopy) {
                  navigator.clipboard.writeText(urlToCopy);
                  toast.success("URL copied to clipboard!");
                }
              }}
              className="flex-shrink-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          
          {/* View Image Button */}
          <Button
            variant="secondary"
            onClick={() => {
              const imageUrl = generatedImageUrl || generatedImageBase64;
              if (imageUrl) {
                window.open(imageUrl, '_blank', 'noopener,noreferrer');
              }
            }}
            className="w-full bg-background border-border hover:bg-background/80 text-foreground"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View Image in New Tab
          </Button>
        </div>
      )}

      {/* Image Preview */}
      {imageDisplayUrl && (
        <div className="flex-1 border border-border rounded-lg overflow-hidden bg-background flex items-center justify-center min-h-0">
          <img
            src={imageDisplayUrl}
            alt="Generated featured image"
            className="w-full h-full object-contain max-h-full"
            onError={(e) => {
              console.error('Image load error:', e);
            }}
            onLoad={() => {
              console.log('Image loaded successfully');
            }}
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* Insert Image into Section */}
      {onInsertImage && availableSections.length > 0 && (
        <div className="space-y-2 flex-shrink-0">
          <Label className="text-foreground">Insert Image into Section:</Label>
          <Select
            value={selectedInsertSection || ""}
            onValueChange={(value) => setSelectedInsertSection(value)}
          >
            <SelectTrigger className="bg-background text-foreground">
              <SelectValue placeholder="Choose a section..." />
            </SelectTrigger>
            <SelectContent>
              {availableSections.map((section, index) => (
                <SelectItem key={index} value={section.header}>
                  {section.header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleInsertImage}
            disabled={!selectedInsertSection || (!generatedImageUrl && !generatedImageBase64)}
            variant="default"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <FileImage className="mr-2 h-4 w-4" />
            Insert Image into Section
          </Button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 flex-shrink-0">
        <Button
          onClick={onDownload}
          variant="secondary"
          className="flex-1 bg-background border-border hover:bg-background/80 text-foreground"
        >
          <Download className="mr-2 h-4 w-4" />
          Download Image
        </Button>
        <Button
          onClick={onCopy}
          variant="secondary"
          className="flex-1 bg-background border-border hover:bg-background/80 text-foreground"
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy Image
        </Button>
      </div>
    </div>
  );
};

