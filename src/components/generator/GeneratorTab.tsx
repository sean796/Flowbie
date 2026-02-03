import React, { useState } from "react";
import { ElementorFeature } from "./elementor/ElementorFeature";
import { CompanyLookup } from "./CompanyLookup";
import { WPEngineCredentials } from "./WPEngineCredentials";
import { SiteClonerFeature } from "./site-cloner/SiteClonerFeature";
import type { CustomizationConfig } from "./elementor/types";

export const GeneratorTab: React.FC = () => {
  const [fetchedCompanyData, setFetchedCompanyData] = useState<Partial<CustomizationConfig> | null>(null);
  const [triggerGenerate, setTriggerGenerate] = useState(false);

  const handleCompanyDataFetched = (data: Partial<CustomizationConfig>) => {
    setFetchedCompanyData(data);
  };

  const handleCompanyValidated = () => {
    setTriggerGenerate(true);
  };

  const handleGenerateTriggered = () => {
    setTriggerGenerate(false);
  };

  return (
    <div className="space-y-6">
      <WPEngineCredentials />
      <CompanyLookup 
        onCompanyDataFetched={handleCompanyDataFetched} 
        onCompanyValidated={handleCompanyValidated}
      />
      <ElementorFeature 
        fetchedCompanyData={fetchedCompanyData} 
        triggerGenerate={triggerGenerate}
        onGenerateTriggered={handleGenerateTriggered}
      />
      <SiteClonerFeature
        fetchedCompanyData={fetchedCompanyData}
        triggerGenerate={triggerGenerate}
        onGenerateTriggered={handleGenerateTriggered}
      />
    </div>
  );
};
