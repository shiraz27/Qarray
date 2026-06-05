import { supabase } from '@/integrations/supabase/client';

export interface HistoryVersion {
  n: number;
  size?: number;
  mtime?: number;
}

export interface RollbackUrlInfo {
  url: string;
  key: string | null;
  versions: HistoryVersion[];
}

export type RollbackTable = 'resources' | 'questions';
export type RollbackVersion = 'earliest' | 'previous' | number;

export async function listRollbackVersions(
  table: RollbackTable,
  id: number,
): Promise<RollbackUrlInfo[]> {
  const { data, error } = await supabase.functions.invoke('pdf-rollback', {
    body: { action: 'list', table, id },
  });
  if (error) throw new Error(error.message || 'Failed to list versions');
  return (data as any)?.urls || [];
}

export interface RollbackResult {
  restored: number;
  skipped: number;
  total: number;
  errors: string[];
}

export async function restoreRowToVersion(
  table: RollbackTable,
  id: number,
  version: RollbackVersion = 'earliest',
): Promise<RollbackResult> {
  const { data, error } = await supabase.functions.invoke('pdf-rollback', {
    body: { action: 'restore', table, id, version },
  });
  if (error) throw new Error(error.message || 'Rollback failed');
  return data as RollbackResult;
}