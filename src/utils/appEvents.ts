import { supabase } from '@/integrations/supabase/client';

export type AppEventSeverity = 'info' | 'warn' | 'error' | 'critical';
export type AppEventCategory = 'preview' | 'download' | 'upload' | 'ocr' | 'ai' | 'other';

export interface AppEventInput {
  severity: AppEventSeverity;
  category: AppEventCategory;
  event_type: string;
  message?: string | null;
  target_url?: string | null;
  content_type?: 'resource' | 'question' | null;
  content_id?: number | null;
  metadata?: Record<string, unknown>;
}

// In-memory dedup ring: signature -> last emit timestamp (ms)
const recent: Map<string, number> = new Map();
const DEBOUNCE_MS = 30_000;

function signature(e: AppEventInput): string {
  return [
    e.category,
    e.event_type,
    e.content_type ?? '',
    e.content_id ?? '',
    e.target_url ?? '',
  ].join('|');
}

/**
 * Fire-and-forget client event logger. Never throws, never blocks UI.
 * Debounced 30s per unique signature.
 */
export function logAppEvent(e: AppEventInput): void {
  try {
    const sig = signature(e);
    const now = Date.now();
    const last = recent.get(sig) ?? 0;
    if (now - last < DEBOUNCE_MS) return;
    recent.set(sig, now);
    // Trim ring if it grows
    if (recent.size > 200) {
      const cutoff = now - DEBOUNCE_MS * 2;
      for (const [k, t] of recent) if (t < cutoff) recent.delete(k);
    }

    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user_id = auth.user?.id ?? null;
        const url = typeof window !== 'undefined' ? window.location.pathname : null;
        await supabase.from('app_events').insert({
          severity: e.severity,
          category: e.category,
          event_type: e.event_type,
          message: e.message ?? null,
          url,
          target_url: e.target_url ?? null,
          content_type: e.content_type ?? null,
          content_id: e.content_id ?? null,
          user_id,
          metadata: (e.metadata as never) ?? {},
        });
      } catch {
        // swallow — monitoring must not break the app
      }
    })();
  } catch {
    /* noop */
  }
}