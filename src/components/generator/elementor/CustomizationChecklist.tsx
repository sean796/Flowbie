import React, { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe, Mail, Phone, Palette, FileText, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCyberpunkCardClasses, getCyberpunkTextClasses, getCyberpunkButtonClasses } from "@/components/integrations/wordpress/cyberpunk-theme";
import { FIELD_TYPE_ICONS, FIELD_TYPE_LABELS } from "@/lib/elementor/template-constants";
import type { WordPressCustomizationField, CustomizationField, FieldType } from "./types";

interface CustomizationChecklistProps {
  fields: WordPressCustomizationField[] | CustomizationField[];
  onFieldsChange: (fields: WordPressCustomizationField[] | CustomizationField[]) => void;
  onFieldClick?: (field: WordPressCustomizationField | CustomizationField) => void;
  onApplyChanges?: () => void;
}

/**
 * Get icon for field type
 */
function getFieldTypeIcon(fieldType: FieldType): React.ReactNode {
  const iconKey = FIELD_TYPE_ICONS[fieldType] || FIELD_TYPE_ICONS.other;
  return <span className="text-xs">{iconKey}</span>;
}

/**
 * Validate field value based on type
 */
function validateFieldValue(value: string, fieldType: FieldType): { valid: boolean; error?: string } {
  switch (fieldType) {
    case 'url':
      try {
        new URL(value);
        return { valid: true };
      } catch {
        return { valid: false, error: 'Invalid URL format' };
      }
    case 'email':
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid email format' };
    case 'phone':
      if (/^[\d\s\(\)\-\+\.]+$/.test(value) && value.replace(/\D/g, '').length >= 10) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid phone format' };
    case 'color':
      if (/^#?([0-9a-fA-F]{3}([0-9a-fA-F]{3})?)$/.test(value.trim())) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid hex color format' };
    default:
      return { valid: true };
  }
}

export const CustomizationChecklist: React.FC<CustomizationChecklistProps> = ({
  fields,
  onFieldsChange,
  onFieldClick,
  onApplyChanges,
}) => {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Check if fields are WordPress fields
  const isWordPressField = (field: WordPressCustomizationField | CustomizationField): field is WordPressCustomizationField => {
    return 'location' in field && 'postId' in (field as any).location;
  };

  const updateField = useCallback((fieldId: string, updates: Partial<WordPressCustomizationField | CustomizationField>) => {
    const updatedFields = fields.map(f =>
      f.id === fieldId ? { ...f, ...updates } : f
    );
    onFieldsChange(updatedFields);
    
    // Clear error for updated field
    if (updates.suggestedValue !== undefined) {
      const field = fields.find(f => f.id === fieldId);
      const validation = validateFieldValue(updates.suggestedValue, field?.fieldType || 'other');
      if (validation.valid) {
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldId];
          return newErrors;
        });
      } else {
        setFieldErrors(prev => ({ ...prev, [fieldId]: validation.error || 'Invalid value' }));
      }
    }
  }, [fields, onFieldsChange]);

  const toggleApproval = useCallback((fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (field) {
      // Validate before approving
      const validation = validateFieldValue(field.suggestedValue, field.fieldType);
      if (!validation.valid && !field.approved) {
        setFieldErrors(prev => ({ ...prev, [fieldId]: validation.error || 'Invalid value' }));
        toast.error(`Cannot approve: ${validation.error}`);
        return;
      }
      
      updateField(fieldId, { approved: !field.approved });
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  }, [fields, updateField]);

  const approvedCount = fields.filter(f => f.approved).length;
  const hasErrors = Object.keys(fieldErrors).length > 0;

  const handleApply = () => {
    if (hasErrors) {
      toast.error('Please fix validation errors before applying changes');
      return;
    }
    if (approvedCount === 0) {
      toast.error('Please approve at least one field to apply changes');
      return;
    }
    onApplyChanges?.();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className={cn(getCyberpunkTextClasses('primary'), "text-sm font-semibold font-mono uppercase tracking-wider mb-1")}>
          Locking Coordinates
        </h3>
        <p className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono")}>
          Review and approve fields for customization
        </p>
      </div>

      {fields.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border border-green-500/20 rounded-lg bg-[#0f0f0f]/50">
          <div className="text-center space-y-3 max-w-md">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 mb-2">
              <FileText className="h-6 w-6 text-green-400/70" />
            </div>
            <h4 className={cn(getCyberpunkTextClasses('primary'), "text-sm font-semibold font-mono")}>
              No Fields Identified
            </h4>
            <p className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono leading-relaxed")}>
              Use the Generate button in the toolbar to scan your WordPress site and identify customizable ACF fields.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="border border-green-500/30 rounded bg-[#0a0a0a]" style={{ height: '600px', overflow: 'hidden' }}>
            <ScrollArea className="h-[600px]">
              <div className="p-1.5">
                {/* Grid Header */}
                <div className="grid grid-cols-10 gap-2 px-1 py-1 mb-1 border-b border-green-500/20">
                  <div className="col-span-1">
                    <span className={cn(getCyberpunkTextClasses('muted'), "text-[10px] font-mono uppercase")}>✓</span>
                  </div>
                  <div className="col-span-3">
                    <span className={cn(getCyberpunkTextClasses('muted'), "text-[10px] font-mono uppercase")}>Field</span>
                  </div>
                  <div className="col-span-4">
                    <span className={cn(getCyberpunkTextClasses('muted'), "text-[10px] font-mono uppercase")}>New</span>
                  </div>
                  <div className="col-span-2">
                    <span className={cn(getCyberpunkTextClasses('muted'), "text-[10px] font-mono uppercase")}>Location</span>
                  </div>
                </div>
                {/* Grid Rows */}
                <div className="space-y-0.5">
                  {fields.map((field) => {
                    const error = fieldErrors[field.id];
                    const isValid = !error;

                    return (
                      <div
                        key={field.id}
                        className={cn(
                          "grid grid-cols-10 gap-2 p-1 rounded border bg-[#1a1a1a] hover:bg-[#1f1f1f] transition-colors items-center",
                          field.approved && "border-green-500/70 bg-green-500/10",
                          !isValid && "border-red-500/50 bg-red-500/5",
                          field.readOnly && "border-yellow-500/50 bg-yellow-500/10"
                        )}
                      >
                        {/* Checkbox - Col 1 */}
                        <div className="col-span-1 flex justify-center">
                          <Checkbox
                            checked={field.approved}
                            onCheckedChange={() => {
                              const isReadOnly = 'readOnly' in field && field.readOnly;
                              if (!isReadOnly) toggleApproval(field.id);
                            }}
                            disabled={'readOnly' in field && field.readOnly}
                            className="border-green-500/50 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 h-3.5 w-3.5"
                          />
                        </div>
                        
                        {/* Field name with icon - Col 2 */}
                        <div className="col-span-3 flex items-center gap-1 min-w-0">
                          <span className="flex-shrink-0 scale-75">{getFieldTypeIcon(field.fieldType)}</span>
                          <span className={cn(getCyberpunkTextClasses('primary'), "text-[11px] font-medium truncate")}>
                            {field.field}
                          </span>
                          {'readOnly' in field && field.readOnly && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 flex-shrink-0">
                              RO
                            </span>
                          )}
                        </div>
                        
                        {/* New value input - Col 3 */}
                        <div className="col-span-4 flex items-center gap-1 min-w-0">
                          {field.fieldType === 'color' && (
                            <div
                              className="w-3.5 h-3.5 rounded border border-green-500/50 flex-shrink-0"
                              style={{ backgroundColor: field.suggestedValue || '#000000' }}
                            />
                          )}
                          <Input
                            value={field.suggestedValue}
                            onChange={(e) => {
                              const isReadOnly = 'readOnly' in field && field.readOnly;
                              if (!isReadOnly) updateField(field.id, { suggestedValue: e.target.value });
                            }}
                            disabled={'readOnly' in field && field.readOnly}
                            className={cn(
                              "h-6 bg-[#0a0a0a] border-green-500/50 text-green-300 font-mono text-[11px] px-1.5 w-full",
                              !isValid && "border-red-500",
                              field.approved && "border-green-500",
                              'readOnly' in field && field.readOnly && "opacity-50 cursor-not-allowed"
                            )}
                            placeholder={'readOnly' in field && field.readOnly ? "RO" : "..."}
                          />
                        </div>
                        
                        {/* Post/File info - Col 4 */}
                        <div className="col-span-2 flex items-center gap-0.5 min-w-0">
                          <FileText className="h-2.5 w-2.5 text-green-400/70 flex-shrink-0" />
                          {isWordPressField(field) ? (
                            <span 
                              className={cn(getCyberpunkTextClasses('muted'), "text-[9px] truncate cursor-pointer hover:text-green-300")} 
                              title={`${field.location.postType}: ${field.location.postTitle}\n${field.location.postLink}\nField Source: ${field.location.fieldSource}${field.location.acfFieldName ? `\nACF Field: ${field.location.acfFieldName}` : ''}`}
                              onClick={() => onFieldClick?.(field)}
                            >
                              {field.location.postType}/{field.location.postId}
                              {field.location.acfFieldName && `:${field.location.acfFieldName}`}
                            </span>
                          ) : (
                            <span className={cn(getCyberpunkTextClasses('muted'), "text-[9px] truncate")} title={(field as CustomizationField).filePath}>
                              {(field as CustomizationField).filePath.split('/').pop()}
                              {(field as CustomizationField).lineNumber && `:${(field as CustomizationField).lineNumber}`}
                            </span>
                          )}
                        </div>
                        
                        {/* Error message - full width below row */}
                        {error && (
                          <div className="col-span-12">
                            <p className="text-red-400 text-[9px] mt-0.5 font-mono">{error}</p>
                          </div>
                        )}
                      </div>
                  );
                })}
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Actions - Grid Layout */}
          <div className="grid grid-cols-12 gap-4 pt-4 border-t border-green-500/20">
            <div className="col-span-12">
              <p className={cn(getCyberpunkTextClasses('muted'), "text-xs font-mono mb-2")}>
                Click Apply to upload approved fields to WordPress
              </p>
              <Button
                onClick={handleApply}
                disabled={hasErrors || approvedCount === 0}
                className={cn(
                  getCyberpunkButtonClasses(true),
                  "w-full font-mono text-xs",
                  (hasErrors || approvedCount === 0) && "opacity-50 cursor-not-allowed"
                )}
              >
                Apply
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
