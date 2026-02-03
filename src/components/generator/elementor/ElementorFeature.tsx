import React from "react";
import { ElementorTemplateProcessor } from "./ElementorTemplateProcessor";
import type { CustomizationConfig } from "./types";

interface ElementorFeatureProps {
  fetchedCompanyData?: Partial<CustomizationConfig> | null;
  triggerGenerate?: boolean;
  onGenerateTriggered?: () => void;
}

export const ElementorFeature: React.FC<ElementorFeatureProps> = ({ 
  fetchedCompanyData, 
  triggerGenerate,
  onGenerateTriggered 
}) => {
  return (
    <ElementorTemplateProcessor 
      fetchedCompanyData={fetchedCompanyData} 
      triggerGenerate={triggerGenerate}
      onGenerateTriggered={onGenerateTriggered}
    />
  );
};
