import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type WordPressSite } from "../types";

interface SiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSite: WordPressSite | null;
  formName: string;
  formSiteUrl: string;
  formUsername: string;
  formAppPassword: string;
  onFormNameChange: (value: string) => void;
  onFormSiteUrlChange: (value: string) => void;
  onFormUsernameChange: (value: string) => void;
  onFormAppPasswordChange: (value: string) => void;
  onSave: () => void;
}

export const SiteDialog: React.FC<SiteDialogProps> = ({
  open,
  onOpenChange,
  editingSite,
  formName,
  formSiteUrl,
  formUsername,
  formAppPassword,
  onFormNameChange,
  onFormSiteUrlChange,
  onFormUsernameChange,
  onFormAppPasswordChange,
  onSave,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editingSite ? "Edit WordPress Site" : "Add WordPress Site"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Enter your WordPress site details. Use an Application Password for authentication.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-foreground">Site Name</Label>
            <Input
              id="name"
              value={formName}
              onChange={(e) => onFormNameChange(e.target.value)}
              placeholder="My WordPress Site"
              className="bg-input border-border text-foreground"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="siteUrl" className="text-foreground">Site URL</Label>
            <Input
              id="siteUrl"
              value={formSiteUrl}
              onChange={(e) => onFormSiteUrlChange(e.target.value)}
              placeholder="https://your-site.com"
              className="bg-input border-border text-foreground"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="username" className="text-foreground">Username</Label>
            <Input
              id="username"
              value={formUsername}
              onChange={(e) => onFormUsernameChange(e.target.value)}
              placeholder="admin"
              className="bg-input border-border text-foreground"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="appPassword" className="text-foreground">Application Password</Label>
            <Input
              id="appPassword"
              type="password"
              value={formAppPassword}
              onChange={(e) => onFormAppPasswordChange(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
              className="bg-input border-border text-foreground"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Create an Application Password in WordPress: Users → Profile → Application Passwords
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-red-400 border-red-400 hover:bg-red-400/10">
            Cancel
          </Button>
          <Button onClick={onSave} className="bg-primary hover:bg-primary/90 text-black font-bold">
            {editingSite ? "Update" : "Add"} Site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

