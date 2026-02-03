import React, { useState } from "react";
import { FileText, Folder, FolderOpen, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCyberpunkTextClasses } from "@/components/integrations/wordpress/cyberpunk-theme";
import type { FileTreeItem, TemplateFile } from "./types";

interface FileTreeNavigatorProps {
  files: TemplateFile[];
  selectedFile?: string;
  onFileSelect: (filePath: string) => void;
}

/**
 * Build file tree structure from flat file list
 */
function buildFileTree(files: TemplateFile[]): FileTreeItem[] {
  const treeMap = new Map<string, FileTreeItem>();
  const rootItems: FileTreeItem[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const path = currentPath ? `${currentPath}/${part}` : part;

      if (!treeMap.has(path)) {
        const item: FileTreeItem = {
          name: part,
          path,
          type: isLast ? 'file' : 'directory',
          size: isLast ? file.size : undefined,
        };

        treeMap.set(path, item);

        if (currentPath === '') {
          rootItems.push(item);
        } else {
          const parent = treeMap.get(currentPath);
          if (parent) {
            if (!parent.children) {
              parent.children = [];
            }
            parent.children.push(item);
          }
        }
      }

      currentPath = path;
    }
  }

  return rootItems;
}

/**
 * Get file icon based on file type
 */
function getFileIcon(type: TemplateFile['type']): React.ReactNode {
  switch (type) {
    case 'xml':
      return <FileText className="h-4 w-4 text-blue-400" />;
    case 'json':
      return <FileText className="h-4 w-4 text-yellow-400" />;
    case 'php':
      return <FileText className="h-4 w-4 text-purple-400" />;
    case 'html':
      return <FileText className="h-4 w-4 text-orange-400" />;
    case 'css':
      return <FileText className="h-4 w-4 text-pink-400" />;
    case 'js':
      return <FileText className="h-4 w-4 text-green-400" />;
    default:
      return <FileText className="h-4 w-4 text-gray-400" />;
  }
}

interface TreeNodeProps {
  item: FileTreeItem;
  level: number;
  selectedFile?: string;
  onFileSelect: (filePath: string) => void;
  files: TemplateFile[];
}

const TreeNode: React.FC<TreeNodeProps> = ({ item, level, selectedFile, onFileSelect, files }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels

  const isSelected = selectedFile === item.path;
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = () => {
    if (item.type === 'file') {
      onFileSelect(item.path);
    } else if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
          "hover:bg-green-500/10",
          isSelected && "bg-green-500/20 border-l-2 border-green-500",
          !isSelected && "border-l-2 border-transparent"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {item.type === 'directory' && (
          <>
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-3 w-3 text-green-400" />
              ) : (
                <ChevronRight className="h-3 w-3 text-green-400" />
              )
            ) : (
              <div className="w-3" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-green-400" />
            ) : (
              <Folder className="h-4 w-4 text-green-400" />
            )}
          </>
        )}
        {item.type === 'file' && (
          <>
            <div className="w-3" />
            {(() => {
              // Try to find file type from files array
              const file = files.find(f => f.path === item.path);
              return getFileIcon(file?.type || 'other');
            })()}
          </>
        )}
        <span className={cn(
          getCyberpunkTextClasses('secondary'),
          "text-sm truncate flex-1",
          isSelected && "font-semibold"
        )}>
          {item.name}
        </span>
        {item.size && (
          <span className={cn(getCyberpunkTextClasses('muted'), "text-xs")}>
            {(item.size / 1024).toFixed(1)}KB
          </span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div>
          {item.children!.map((child) => (
            <TreeNode
              key={child.path}
              item={child}
              level={level + 1}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
              files={files}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTreeNavigator: React.FC<FileTreeNavigatorProps> = ({
  files,
  selectedFile,
  onFileSelect,
}) => {
  const tree = buildFileTree(files);

  if (files.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className={cn(getCyberpunkTextClasses('muted'), "text-sm")}>
          No files loaded
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-2 space-y-1">
        {tree.map((item) => (
          <TreeNode
            key={item.path}
            item={item}
            level={0}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            files={files}
          />
        ))}
      </div>
    </div>
  );
};
