import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Badge } from "lucide-react";
import { AgentConfig } from "./AgentNode";

interface AgentApprovalCardProps {
  agent: AgentConfig;
  onApprove: (agent: AgentConfig) => void;
  onReject: () => void;
}

export const AgentApprovalCard: React.FC<AgentApprovalCardProps> = ({
  agent,
  onApprove,
  onReject,
}) => {
  const getFeatureTypeColor = (feature: string) => {
    if (feature.startsWith("[FAQ]")) return "bg-blue-500/20 text-blue-400";
    if (feature.startsWith("[LIST]")) return "bg-green-500/20 text-green-400";
    if (feature.startsWith("[LINK]")) return "bg-purple-500/20 text-purple-400";
    if (feature.startsWith("[IMAGE]")) return "bg-orange-500/20 text-orange-400";
    if (feature.startsWith("[CUSTOM]")) return "bg-pink-500/20 text-pink-400";
    return "bg-muted text-muted-foreground";
  };

  return (
    <Card className="border-2 border-primary/30 bg-card/50 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span>{agent.title}</span>
          <Badge variant="outline" className="text-xs">
            Step {agent.step}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {agent.description || "No description provided."}
          </p>
        </div>
        {agent.features.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Features ({agent.features.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {agent.features.map((feature, index) => {
                const featureType = feature.match(/^\[([A-Z]+)\]/)?.[1] || "CUSTOM";
                const featureDesc = feature.replace(/^\[[A-Z]+\]:\s*/, "");
                return (
                  <div
                    key={index}
                    className={`px-2 py-1 rounded text-xs ${getFeatureTypeColor(feature)}`}
                    title={featureDesc}
                  >
                    <span className="font-medium">{featureType}</span>
                    {featureDesc && (
                      <span className="ml-1 opacity-80">: {featureDesc.substring(0, 30)}{featureDesc.length > 30 ? "..." : ""}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex gap-2 pt-3">
        <Button
          onClick={() => onApprove(agent)}
          size="sm"
          className="flex-1 bg-primary hover:bg-primary/90"
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Approve
        </Button>
        <Button
          onClick={onReject}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          <XCircle className="w-4 h-4 mr-2" />
          Reject
        </Button>
      </CardFooter>
    </Card>
  );
};

