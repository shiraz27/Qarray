import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ShieldAlert } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';

interface Alert { id: string; severity: 'warn' | 'critical'; message: string }

/**
 * Compact red banner shown to admins when there are active critical alerts.
 * Polls health-snapshot every 60s. Safe to render on any page.
 */
export const MonitoringAlertsBanner: React.FC = () => {
  const { isAdmin } = useUserRole();
  const [criticals, setCriticals] = useState<Alert[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase.functions.invoke('health-snapshot');
        if (cancelled) return;
        const all = (data?.alerts ?? []) as Alert[];
        setCriticals(all.filter((a) => a.severity === 'critical'));
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isAdmin]);

  if (!isAdmin || criticals.length === 0) return null;

  return (
    <Link
      to="/statistics#monitoring"
      className="block rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300 hover:bg-red-500/20"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" />
        <span className="font-semibold">{criticals.length} critical alert{criticals.length > 1 ? 's' : ''}:</span>
        <span className="truncate">{criticals.map((c) => c.message).join(' · ')}</span>
        <span className="ml-auto text-xs underline">Open monitoring →</span>
      </div>
    </Link>
  );
};