import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { CSVRow } from '@/lib/bulk-auto-generate';

interface EditBlogIdeaDialogProps {
  editingIndex: number | null;
  setEditingIndex: (index: number | null) => void;
  editFormData: CSVRow | null;
  setEditFormData: (data: CSVRow | null) => void;
  setGeneratedRows: (rows: CSVRow[] | ((prev: CSVRow[]) => CSVRow[])) => void;
}

export function EditBlogIdeaDialog({
  editingIndex,
  setEditingIndex,
  editFormData,
  setEditFormData,
  setGeneratedRows,
}: EditBlogIdeaDialogProps) {
  const handleSave = () => {
    if (!editFormData || editingIndex === null) return;
    
    if (!editFormData.title.trim() || !editFormData.keyword.trim()) {
      toast.error('Title and keyword are required');
      return;
    }

    // Update the row at the editing index
    setGeneratedRows(prev => {
      const updated = [...prev];
      updated[editingIndex] = editFormData;
      return updated;
    });

    toast.success('Blog idea updated');
    setEditingIndex(null);
    setEditFormData(null);
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setEditFormData(null);
  };

  return (
    <Dialog open={editingIndex !== null} onOpenChange={(open) => {
      if (!open) {
        handleCancel();
      }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Blog Idea</DialogTitle>
          <DialogDescription>
            Modify the blog idea details below.
          </DialogDescription>
        </DialogHeader>
        {editFormData && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title *</Label>
              <Input
                id="edit-title"
                value={editFormData.title}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                placeholder="Blog post title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-keyword">Keyword *</Label>
              <Input
                id="edit-keyword"
                value={editFormData.keyword}
                onChange={(e) => setEditFormData({ ...editFormData, keyword: e.target.value })}
                placeholder="Primary keyword"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-entity">Entity (Optional)</Label>
              <Input
                id="edit-entity"
                value={editFormData.entity || ''}
                onChange={(e) => setEditFormData({ ...editFormData, entity: e.target.value || undefined })}
                placeholder="Entity name (e.g., business name, brand)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-modifier">Modifier (Optional)</Label>
              <Input
                id="edit-modifier"
                value={editFormData.modifier || ''}
                onChange={(e) => setEditFormData({ ...editFormData, modifier: e.target.value || undefined })}
                placeholder="Modifier (e.g., comprehensive guide, beginner-friendly)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-featured-image">Featured Image</Label>
              <Select
                value={editFormData.featuredImage || 'y'}
                onValueChange={(value) => setEditFormData({ ...editFormData, featuredImage: value })}
              >
                <SelectTrigger id="edit-featured-image">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="y">Yes</SelectItem>
                  <SelectItem value="n">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
