/**
 * Domain Input Component
 * Text input for domain name (no validation - assumes user input is correct)
 */

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface DomainInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const DomainInput: React.FC<DomainInputProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="domain-input">Domain Name</Label>
      <Input
        id="domain-input"
        type="text"
        placeholder="example.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="font-mono"
      />
      <p className="text-xs text-muted-foreground">
        Enter the domain name for the new site (e.g., newclient.com)
      </p>
    </div>
  );
};
