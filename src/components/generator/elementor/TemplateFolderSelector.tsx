import React, { useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FolderOpen, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "@/components/integrations/wordpress/cyberpunk-theme";
import { extractMetadata } from "@/lib/elementor/template-metadata-parser";
import type { TemplateFile } from "./types";

interface TemplateFolderSelectorProps {
  onFilesSelected: (files: TemplateFile[], metadata?: { manifest?: any; siteSettings?: any }) => void;
  disabled?: boolean;
}

export interface TemplateFolderSelectorHandle {
  triggerSelect: () => void;
}

/**
 * Read file content using File System Access API or FileReader
 */
async function readFileContent(file: File | FileSystemFileHandle): Promise<string> {
  if (file instanceof File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
  } else {
    // FileSystemFileHandle
    const fileObj = await file.getFile();
    return readFileContent(fileObj);
  }
}

/**
 * Recursively read directory contents with folder filtering
 */
async function readDirectory(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string = '',
  maxDepth: number = 10,
  currentDepth: number = 0
): Promise<TemplateFile[]> {
  const files: TemplateFile[] = [];
  
  if (currentDepth >= maxDepth) {
    return files;
  }

  const isRoot = basePath === '';

  try {
    for await (const [name, handle] of dirHandle.entries()) {
      const path = basePath ? `${basePath}/${name}` : name;
      const nameLower = name.toLowerCase();
      
      if (handle.kind === 'file') {
        // Only include manifest and site-settings from root
        // For subdirectories, only include if in wp-content
        if (isRoot) {
          // Handle files with or without extensions, case-insensitive
          const fileName = nameLower;
          const fileNameNoExt = fileName.split('.')[0]; // Get name without extension
          const isManifest = fileName === 'manifest' || 
                            fileName === 'manifest.json' ||
                            fileNameNoExt === 'manifest';
          const isSiteSettings = fileName === 'site-settings' || 
                                fileName === 'site-settings.json' || 
                                fileName === 'site_settings.json' ||
                                fileNameNoExt === 'site-settings' ||
                                fileNameNoExt === 'site_settings';
          
          if (!isManifest && !isSiteSettings) {
            continue; // Skip all other root files
          }
        } else {
          // For subdirectories, only include if in wp-content
          // Check both path formats: "wp-content/file" and "wp-content/subfolder/file"
          if (!path.startsWith('wp-content/') && !basePath.includes('wp-content')) {
            continue; // Skip files not in wp-content
          }
        }
        
        try {
          const file = await handle.getFile();
          const content = await readFileContent(file);
          
          // Determine file type
          const ext = name.split('.').pop()?.toLowerCase() || '';
          let type: TemplateFile['type'] = 'other';
          if (['xml', 'wxr'].includes(ext)) type = 'xml';
          else if (ext === 'json') type = 'json';
          else if (ext === 'php') type = 'php';
          else if (['html', 'htm'].includes(ext)) type = 'html';
          else if (ext === 'css') type = 'css';
          else if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) type = 'js';
          
          files.push({
            path,
            name,
            content,
            size: file.size,
            type,
            encoding: 'UTF-8',
          });
        } catch (error) {
          console.warn(`Failed to read file ${path}:`, error);
        }
      } else if (handle.kind === 'directory') {
        // Always exclude these folders
        if (['content', 'tax', 'taxonomies', 'templates'].includes(nameLower)) {
          continue;
        }
        
        // Only process wp-content from root, or subdirectories within wp-content
        if (isRoot) {
          if (nameLower !== 'wp-content') {
            continue; // Skip all root folders except wp-content
          }
        } else {
          // Only process if we're already inside wp-content
          // Check both basePath and path to ensure we're in wp-content
          if (!basePath.includes('wp-content') && !path.startsWith('wp-content/')) {
            continue;
          }
        }
        
        // Recursively read wp-content subdirectories
        const subFiles = await readDirectory(handle, path, maxDepth, currentDepth + 1);
        files.push(...subFiles);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${basePath}:`, error);
  }

  return files;
}

/**
 * Validate folder contains WordPress/Elementor files
 */
function validateTemplateFolder(files: TemplateFile[]): { valid: boolean; message?: string } {
  if (files.length === 0) {
    return { valid: false, message: 'No files found in selected folder' };
  }

  // Check for required files: manifest/site-settings + wp-content
  const hasManifest = files.some(f => {
    const fileName = f.path.split('/').pop()?.toLowerCase() || '';
    return fileName === 'manifest' || fileName === 'manifest.json' || fileName.split('.')[0] === 'manifest';
  });
  const hasSiteSettings = files.some(f => {
    const fileName = f.path.split('/').pop()?.toLowerCase() || '';
    const nameNoExt = fileName.split('.')[0];
    return fileName.includes('site-settings') || fileName.includes('site_settings') || 
           nameNoExt === 'site-settings' || nameNoExt === 'site_settings';
  });
  const hasWpContent = files.some(f => f.path.includes('wp-content'));
  
  // Accept if we have wp-content OR manifest/site-settings (or both)
  if (!hasWpContent && !hasManifest && !hasSiteSettings) {
    return {
      valid: false,
      message: 'Selected folder must contain wp-content folder or manifest/site-settings files',
    };
  }

  return { valid: true };
}

export const TemplateFolderSelector = forwardRef<TemplateFolderSelectorHandle, TemplateFolderSelectorProps>(({
  onFilesSelected,
  disabled = false,
}, ref) => {
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [fileCount, setFileCount] = useState<number>(0);

  useImperativeHandle(ref, () => ({
    triggerSelect: () => {
      if (!disabled && !isLoading) {
        handleSelectFolder();
      }
    },
  }));

  const handleSelectFolder = useCallback(async () => {
    if (disabled) return;

    try {
      setIsLoading(true);

      // Check if File System Access API is available
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        const name = dirHandle.name;
        setSelectedPath(name);

        // Read all files from directory (recursively loads wp-content subfolders)
        // Start with empty basePath for root directory
        const files = await readDirectory(dirHandle, '');
        setFileCount(files.length);

        console.log('[TemplateFolderSelector] Loaded files:', files.length);
        console.log('[TemplateFolderSelector] File paths:', files.map(f => f.path));

        // Validate folder - accept if we have files (even if just manifest/site-settings)
        if (files.length === 0) {
          toast.error('No files found. Make sure the folder contains manifest, site-settings, or wp-content folder.');
          setIsLoading(false);
          return;
        }

        // Extract metadata (manifest.json and site-settings.json)
        const metadata = extractMetadata(files);
        console.log('[TemplateFolderSelector] Metadata:', { 
          hasManifest: !!metadata.manifest, 
          hasSiteSettings: !!metadata.siteSettings 
        });

        onFilesSelected(files, metadata);
        toast.success(`Loaded ${files.length} files${metadata.manifest || metadata.siteSettings ? ' (metadata found)' : ''}`);
      } else {
        // Fallback: use file input
        toast.error('File System Access API not supported. Please use "Load XML File" instead.');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error selecting folder:', error);
        toast.error('Failed to select folder');
      }
    } finally {
      setIsLoading(false);
    }
  }, [disabled, onFilesSelected]);

  const handleLoadXMLFile = useCallback(async () => {
    if (disabled) return;

    try {
      setIsLoading(true);

      // Check if File System Access API is available
      if ('showOpenFilePicker' in window) {
        const fileHandles = await (window as any).showOpenFilePicker({
          types: [{
            description: 'XML Files',
            accept: { 'application/xml': ['.xml'], 'text/xml': ['.xml'] },
          }],
          multiple: false,
        });

        if (fileHandles.length > 0) {
          const fileHandle = fileHandles[0];
          const file = await fileHandle.getFile();
          const content = await readFileContent(file);
          
          setSelectedPath(file.name);
          setFileCount(1);

          const templateFile: TemplateFile = {
            path: file.name,
            name: file.name,
            content,
            size: file.size,
            type: 'xml',
            encoding: 'UTF-8',
          };

          onFilesSelected([templateFile]);
          toast.success('XML file loaded successfully');
        }
      } else {
        // Fallback: use file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xml,application/xml,text/xml';
        input.onchange = async (e) => {
          const target = e.target as HTMLInputElement;
          const file = target.files?.[0];
          if (file) {
            try {
              const content = await readFileContent(file);
              setSelectedPath(file.name);
              setFileCount(1);

              const templateFile: TemplateFile = {
                path: file.name,
                name: file.name,
                content,
                size: file.size,
                type: 'xml',
                encoding: 'UTF-8',
              };

              onFilesSelected([templateFile]);
              toast.success('XML file loaded successfully');
            } catch (error) {
              console.error('Error reading file:', error);
              toast.error('Failed to read file');
            }
          }
          setIsLoading(false);
        };
        input.click();
        return;
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error loading XML file:', error);
        toast.error('Failed to load XML file');
      }
    } finally {
      setIsLoading(false);
    }
  }, [disabled, onFilesSelected]);

  // This component is now hidden - folder selection is handled by main button
  // But we keep it for the ref and file loading logic
  return null;
});

TemplateFolderSelector.displayName = 'TemplateFolderSelector';
