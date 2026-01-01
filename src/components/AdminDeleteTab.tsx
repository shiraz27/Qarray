import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Trash2, AlertTriangle, Search, Loader2 } from 'lucide-react';

const ALLOWED_TABLES = [
  'memorizations',
  'flashcards',
  'flashcard_reviews',
  'memorization_subscriptions',
  'questions',
  'answers',
  'resources',
  'bookmarks',
  'votes',
  'notifications',
] as const;

type AllowedTable = typeof ALLOWED_TABLES[number];

interface PreviewItem {
  id: number | string;
  title?: string;
  data?: string;
  created_at?: string;
}

export function AdminDeleteTab() {
  const [selectedTable, setSelectedTable] = useState<AllowedTable>('memorizations');
  const [deleteIds, setDeleteIds] = useState('');
  const [deleteAll, setDeleteAll] = useState(false);
  const [hardDelete, setHardDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewItem[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const fetchPreview = async () => {
    setPreviewLoading(true);
    try {
      let query = supabase.from(selectedTable).select('*').limit(50);

      if (!deleteAll && deleteIds.trim()) {
        const ids = deleteIds.split(',').map(id => id.trim()).filter(Boolean);
        if (ids.length === 0) {
          toast.error('Please enter valid IDs');
          setPreviewLoading(false);
          return;
        }
        query = query.in('id', ids.map(id => isNaN(Number(id)) ? id : Number(id)));
      }

      const { data, error } = await query;

      if (error) throw error;

      setPreviewData((data || []).map((item: any) => ({
        id: item.id,
        title: item.title || item.name || item.full_name,
        data: item.data || item.description || item.message,
        created_at: item.created_at || item.subscribed_at,
      })));

      if (data?.length === 0) {
        toast.info('No items found matching criteria');
      }
    } catch (error: any) {
      console.error('Preview error:', error);
      toast.error('Failed to fetch preview: ' + error.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteAll && confirmText !== 'DELETE ALL') {
      toast.error('Please type "DELETE ALL" to confirm');
      return;
    }

    setLoading(true);
    try {
      const idsArray = deleteAll 
        ? undefined 
        : deleteIds.split(',').map(id => {
            const trimmed = id.trim();
            return isNaN(Number(trimmed)) ? trimmed : Number(trimmed);
          }).filter(Boolean);

      const { data, error } = await supabase.functions.invoke('admin-delete', {
        body: {
          table: selectedTable,
          ids: idsArray,
          deleteAll: deleteAll,
          hardDelete: hardDelete,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(`Deleted ${data.deleted} items from ${selectedTable}`);
      
      if (data.cascade && Object.keys(data.cascade).length > 0) {
        const cascadeInfo = Object.entries(data.cascade)
          .map(([table, count]) => `${table}: ${count}`)
          .join(', ');
        toast.info(`Cascade deletes: ${cascadeInfo}`);
      }

      // Reset form
      setDeleteIds('');
      setPreviewData([]);
      setConfirmDialogOpen(false);
      setConfirmText('');
      setDeleteAll(false);
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getDisplayValue = (item: PreviewItem) => {
    if (item.title) return item.title;
    if (item.data) {
      const str = typeof item.data === 'string' ? item.data : JSON.stringify(item.data);
      return str.length > 50 ? str.substring(0, 50) + '...' : str;
    }
    return '-';
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-destructive" />
          Admin Delete
        </h2>
        <p className="text-muted-foreground mb-6">
          Delete content from database tables. Use with caution.
        </p>

        <div className="space-y-6">
          {/* Table Selection */}
          <div className="space-y-2">
            <Label>Table</Label>
            <Select value={selectedTable} onValueChange={(v) => setSelectedTable(v as AllowedTable)}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Select table" />
              </SelectTrigger>
              <SelectContent>
                {ALLOWED_TABLES.map((table) => (
                  <SelectItem key={table} value={table}>
                    {table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Delete Mode */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="deleteAll"
                checked={deleteAll}
                onCheckedChange={(checked) => {
                  setDeleteAll(checked === true);
                  if (checked) setDeleteIds('');
                }}
              />
              <Label htmlFor="deleteAll" className="text-sm font-medium cursor-pointer">
                Delete ALL rows from this table
              </Label>
              {deleteAll && (
                <Badge variant="destructive" className="ml-2">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Dangerous
                </Badge>
              )}
            </div>

            {!deleteAll && (
              <div className="space-y-2">
                <Label htmlFor="ids">IDs (comma-separated)</Label>
                <Input
                  id="ids"
                  placeholder="1, 2, 3, 45, 67"
                  value={deleteIds}
                  onChange={(e) => setDeleteIds(e.target.value)}
                  className="max-w-md"
                />
              </div>
            )}
          </div>

          {/* Hard Delete Option */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hardDelete"
              checked={hardDelete}
              onCheckedChange={(checked) => setHardDelete(checked === true)}
            />
            <Label htmlFor="hardDelete" className="text-sm cursor-pointer">
              Hard Delete (permanent, cannot be undone)
            </Label>
            {hardDelete && (
              <Badge variant="outline" className="ml-2 border-destructive text-destructive">
                Permanent
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Default: soft delete (sets deleted=true where applicable)
          </p>

          {/* Preview Button */}
          <Button
            variant="outline"
            onClick={fetchPreview}
            disabled={previewLoading || (!deleteAll && !deleteIds.trim())}
            className="gap-2"
          >
            {previewLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Preview
          </Button>
        </div>
      </Card>

      {/* Preview Results */}
      {previewData.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            Preview ({previewData.length} items will be affected)
            {deleteAll && <Badge variant="destructive">All rows</Badge>}
          </h3>

          <div className="border rounded-lg overflow-hidden mb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">ID</TableHead>
                  <TableHead>Title/Data</TableHead>
                  <TableHead className="w-40">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.slice(0, 10).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.id}</TableCell>
                    <TableCell className="max-w-md truncate">
                      {getDisplayValue(item)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {previewData.length > 10 && (
            <p className="text-sm text-muted-foreground mb-4">
              ... and {previewData.length - 10} more items
            </p>
          )}

          <Button
            variant="destructive"
            onClick={() => setConfirmDialogOpen(true)}
            disabled={loading}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete {previewData.length} Items
          </Button>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirm Deletion
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                You are about to {hardDelete ? 'permanently delete' : 'soft delete'}{' '}
                <strong>{deleteAll ? 'ALL' : previewData.length}</strong> items from{' '}
                <strong>{selectedTable}</strong>.
              </p>
              
              {hardDelete && (
                <p className="text-destructive font-medium">
                  ⚠️ This action cannot be undone. Data will be permanently removed.
                </p>
              )}

              {deleteAll && (
                <div className="space-y-2">
                  <Label htmlFor="confirmText">Type "DELETE ALL" to confirm:</Label>
                  <Input
                    id="confirmText"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE ALL"
                  />
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loading || (deleteAll && confirmText !== 'DELETE ALL')}
              className="bg-destructive hover:bg-destructive/90"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
