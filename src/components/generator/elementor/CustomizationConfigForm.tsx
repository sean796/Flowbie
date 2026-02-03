import React, { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HexColorPicker } from "react-colorful";
import { Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "@/components/integrations/wordpress/cyberpunk-theme";
import { parseConfigFile, downloadConfigTemplate } from "@/lib/elementor/config-file-parser";
import type { CustomizationConfig } from "./types";

interface CustomizationConfigFormProps {
  config: CustomizationConfig;
  onConfigChange: (config: CustomizationConfig) => void;
  onSave?: () => void;
}

// Color input field component (reusable)
const ColorInputField = ({ 
  label, 
  value, 
  onChange,
  required = false
}: { 
  label: string; 
  value: string; 
  onChange: (color: string) => void;
  required?: boolean;
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
      setInputValue(value || "#000000");
    }
  }, [inputValue, value, onChange]);

  const displayValue = value || "#000000";
  const displayText = value || "Click to pick color";

  return (
    <div className="space-y-2">
      <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
        {label} {required && <span className="text-red-400">*</span>}
      </Label>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-10",
              getCyberpunkButtonClasses()
            )}
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
            const target = e.target as HTMLElement;
            if (contentRef.current?.contains(target)) {
              e.preventDefault();
              return;
            }
            const reactColorfulElement = document.querySelector('.react-colorful');
            if (reactColorfulElement && reactColorfulElement.contains(target)) {
              e.preventDefault();
            }
          }}
        >
          <div 
            ref={contentRef}
            className="p-4 flex flex-col space-y-4"
            onPointerDown={(e) => e.stopPropagation()}
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

export const CustomizationConfigForm: React.FC<CustomizationConfigFormProps> = ({
  config,
  onConfigChange,
  onSave,
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation functions
  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    // Basic phone validation - allows various formats
    return /^[\d\s\(\)\-\+\.]+$/.test(phone) && phone.replace(/\D/g, '').length >= 10;
  };

  const validateHexColor = (color: string): boolean => {
    return /^#?([0-9a-fA-F]{3}([0-9a-fA-F]{3})?)$/.test(color.trim());
  };

  const updateConfig = useCallback((updates: Partial<CustomizationConfig>) => {
    const newConfig = { ...config, ...updates };
    onConfigChange(newConfig);
    
    // Clear errors for updated fields
    const newErrors = { ...errors };
    Object.keys(updates).forEach(key => {
      delete newErrors[key];
    });
    setErrors(newErrors);
  }, [config, onConfigChange, errors]);

  const validateField = useCallback((field: string, value: string): string | null => {
    switch (field) {
      case 'siteUrl':
        if (!value.trim()) return 'Site URL is required';
        if (!validateUrl(value)) return 'Invalid URL format';
        return null;
      case 'businessName':
        if (!value.trim()) return 'Business name is required';
        return null;
      case 'email':
        if (!value.trim()) return 'Email is required';
        if (!validateEmail(value)) return 'Invalid email format';
        return null;
      case 'phone':
        if (!value.trim()) return 'Phone is required';
        if (!validatePhone(value)) return 'Invalid phone format';
        return null;
      case 'primaryColor':
      case 'secondaryColor':
      case 'accentColor':
        if (!value.trim()) return 'Color is required';
        if (!validateHexColor(value)) return 'Invalid hex color format';
        return null;
      default:
        return null;
    }
  }, []);

  const handleBlur = useCallback((field: string, value: string) => {
    const error = validateField(field, value);
    if (error) {
      setErrors(prev => ({ ...prev, [field]: error }));
    } else {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [validateField]);

  const isFormValid = (): boolean => {
    return (
      validateUrl(config.siteUrl) &&
      config.businessName.trim() !== '' &&
      validateEmail(config.email) &&
      validatePhone(config.phone) &&
      validateHexColor(config.primaryColor) &&
      validateHexColor(config.secondaryColor) &&
      validateHexColor(config.accentColor)
    );
  };

  const handleDownloadTemplate = useCallback(() => {
    try {
      downloadConfigTemplate();
      toast.success('Configuration template downloaded');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Failed to download template');
    }
  }, []);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      const content = await file.text();
      const parsedConfig = parseConfigFile(content);
      
      // Merge parsed config with existing config
      const mergedConfig: CustomizationConfig = {
        ...config,
        ...parsedConfig,
      };

      onConfigChange(mergedConfig);
      toast.success('Configuration loaded from file');
    } catch (error) {
      console.error('Error parsing config file:', error);
      toast.error('Failed to parse configuration file. Please check the format.');
    }
  }, [config, onConfigChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className={cn(getCyberpunkTextClasses('primary'), "text-base font-semibold mb-1")}>
            Configure Target
          </h3>
          <p className={cn(getCyberpunkTextClasses('muted'), "text-xs")}>
            Enter the required information and brand colors for template customization
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className={cn(getCyberpunkButtonClasses(), "gap-2 h-8 text-xs")}
          >
            <Download className="h-3 w-3" />
            Download Template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className={cn(getCyberpunkButtonClasses(), "gap-2 h-8 text-xs")}
          >
            <Upload className="h-3 w-3" />
            Upload Config
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Required Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
              Site URL <span className="text-red-400">*</span>
            </Label>
            <Input
              value={config.siteUrl}
              onChange={(e) => updateConfig({ siteUrl: e.target.value })}
              onBlur={(e) => handleBlur('siteUrl', e.target.value)}
              placeholder="https://newsite.com"
              className={cn(
                "bg-[#1a1a1a] border-green-500/50 text-green-300",
                errors.siteUrl && "border-red-500"
              )}
            />
            {errors.siteUrl && (
              <p className="text-red-400 text-xs">{errors.siteUrl}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
              Business Name <span className="text-red-400">*</span>
            </Label>
            <Input
              value={config.businessName}
              onChange={(e) => updateConfig({ businessName: e.target.value })}
              onBlur={(e) => handleBlur('businessName', e.target.value)}
              placeholder="New Business Name"
              className={cn(
                "bg-[#1a1a1a] border-green-500/50 text-green-300",
                errors.businessName && "border-red-500"
              )}
            />
            {errors.businessName && (
              <p className="text-red-400 text-xs">{errors.businessName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
              Email <span className="text-red-400">*</span>
            </Label>
            <Input
              type="email"
              value={config.email}
              onChange={(e) => updateConfig({ email: e.target.value })}
              onBlur={(e) => handleBlur('email', e.target.value)}
              placeholder="contact@newsite.com"
              className={cn(
                "bg-[#1a1a1a] border-green-500/50 text-green-300",
                errors.email && "border-red-500"
              )}
            />
            {errors.email && (
              <p className="text-red-400 text-xs">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
              Phone <span className="text-red-400">*</span>
            </Label>
            <Input
              value={config.phone}
              onChange={(e) => updateConfig({ phone: e.target.value })}
              onBlur={(e) => handleBlur('phone', e.target.value)}
              placeholder="(555) 123-4567"
              className={cn(
                "bg-[#1a1a1a] border-green-500/50 text-green-300",
                errors.phone && "border-red-500"
              )}
            />
            {errors.phone && (
              <p className="text-red-400 text-xs">{errors.phone}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
              Address
            </Label>
            <Textarea
              value={config.address || ''}
              onChange={(e) => updateConfig({ address: e.target.value })}
              placeholder="123 Main St, City, ST 12345"
              className="bg-[#1a1a1a] border-green-500/50 text-green-300 min-h-[80px]"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
              City
            </Label>
            <Input
              value={config.city || ''}
              onChange={(e) => updateConfig({ city: e.target.value })}
              placeholder="City"
              className="bg-[#1a1a1a] border-green-500/50 text-green-300"
            />
          </div>

          <div className="space-y-2">
            <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
              State/Province
            </Label>
            <Input
              value={config.stateProvince || ''}
              onChange={(e) => updateConfig({ stateProvince: e.target.value })}
              placeholder="State or Province"
              className="bg-[#1a1a1a] border-green-500/50 text-green-300"
            />
          </div>

          <div className="space-y-2">
            <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
              Postal Code
            </Label>
            <Input
              value={config.postalCode || ''}
              onChange={(e) => updateConfig({ postalCode: e.target.value })}
              placeholder="12345"
              className="bg-[#1a1a1a] border-green-500/50 text-green-300"
            />
          </div>

          <div className="space-y-2">
            <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
              Country
            </Label>
            <Input
              value={config.country || ''}
              onChange={(e) => updateConfig({ country: e.target.value })}
              placeholder="Country"
              className="bg-[#1a1a1a] border-green-500/50 text-green-300"
            />
          </div>
        </div>

      {/* Brand Colors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ColorInputField
            label="Primary Color"
            value={config.primaryColor}
            onChange={(color) => updateConfig({ primaryColor: color })}
            required
          />
          <ColorInputField
            label="Secondary Color"
            value={config.secondaryColor}
            onChange={(color) => updateConfig({ secondaryColor: color })}
            required
          />
          <ColorInputField
            label="Accent Color"
            value={config.accentColor}
            onChange={(color) => updateConfig({ accentColor: color })}
            required
          />
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ColorInputField
          label="Background Color"
          value={config.backgroundColor || '#000000'}
          onChange={(color) => updateConfig({ backgroundColor: color })}
        />
        <ColorInputField
          label="Text Color"
          value={config.textColor || '#ffffff'}
          onChange={(color) => updateConfig({ textColor: color })}
        />
      </div>

      {/* Prompt Modifier Section */}
      <div className="space-y-1.5">
        <Label className={cn(getCyberpunkTextClasses('secondary'), "text-sm")}>
          Prompt Modifier (Optional)
        </Label>
        <Textarea
          value={config.promptModifier || ''}
          onChange={(e) => updateConfig({ promptModifier: e.target.value })}
          placeholder="Enter any additional customization requirements, unexpected changes, or specific instructions for the AI..."
          className="bg-[#1a1a1a] border-green-500/50 text-green-300 min-h-[120px] font-mono text-sm"
          rows={5}
        />
        <p className={cn(getCyberpunkTextClasses('muted'), "text-xs")}>
          Use this field to provide additional instructions for unexpected customizations or specific requirements.
        </p>
      </div>

      {/* Save Button */}
      {onSave && (
        <div className="flex justify-end">
          <Button
            onClick={onSave}
            disabled={!isFormValid()}
            className={cn(
              getCyberpunkButtonClasses(),
              !isFormValid() && "opacity-50 cursor-not-allowed"
            )}
          >
            Save Configuration
          </Button>
        </div>
      )}

      {/* Validation Summary */}
      {!isFormValid() && (
        <div className="p-2 bg-red-500/10 border border-red-500/50 rounded">
          <p className={cn(getCyberpunkTextClasses('secondary'), "text-xs text-red-300")}>
            Please fill in all required fields correctly before proceeding.
          </p>
        </div>
      )}
    </div>
  );
};
