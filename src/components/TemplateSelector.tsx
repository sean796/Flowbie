import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { templates, Template } from "@/lib/templates";
import { FileText, Sparkles } from "lucide-react";
import { StoredBlueprint } from "@/hooks/use-blueprint-management";

interface TemplateSelectorProps {
  onSelectTemplate: (blueprint: StoredBlueprint) => void;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ onSelectTemplate }) => {
  const handleTemplateSelect = (template: Template) => {
    // Convert template blueprint to StoredBlueprint format
    const storedBlueprint: StoredBlueprint = {
      id: `template-${template.id}`,
      nodeCount: template.blueprint.agents.length,
      ...template.blueprint,
    };
    
    onSelectTemplate(storedBlueprint);
  };

  const categories = Array.from(new Set(templates.map(t => t.category)));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Quick Start Templates</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Choose a template to quickly set up your blueprint structure. You can customize it after loading.
        </p>
      </div>

      {categories.map((category) => (
        <div key={category} className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {category}
          </h4>
          <div className="grid grid-cols-1 gap-3">
            {templates
              .filter(t => t.category === category)
              .map((template) => (
                <Card
                  key={template.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleTemplateSelect(template)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          {template.name}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {template.description}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {template.blueprint.agents.length} sections
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTemplateSelect(template);
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-2" />
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
};
