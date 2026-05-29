import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { Badge } from '@/components/ui/badge';
import { Bot, Sparkles, ListOrdered, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type AiKind = 'correction' | 'summary' | 'step_by_step' | 'infographic';

export interface AiAnswerPayload {
  ai_kind: AiKind;
  language?: 'fr' | 'ar';
  content?: string;
  svg?: string;
  model?: string;
}

const LABELS_FR: Record<AiKind, string> = {
  correction: 'Correction',
  summary: 'Résumé',
  step_by_step: 'Étape par étape',
  infographic: 'Infographie',
};
const LABELS_AR: Record<AiKind, string> = {
  correction: 'التصحيح',
  summary: 'الملخص',
  step_by_step: 'خطوة بخطوة',
  infographic: 'إنفوغرافيك',
};
const ICONS: Record<AiKind, React.ComponentType<{ className?: string }>> = {
  correction: Sparkles,
  summary: FileText,
  step_by_step: ListOrdered,
  infographic: ImageIcon,
};

export function parseAiAnswer(raw: string | null | undefined): AiAnswerPayload | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object' && typeof obj.ai_kind === 'string') {
      return obj as AiAnswerPayload;
    }
  } catch {
    return null;
  }
  return null;
}

export const AiAnswerRenderer: React.FC<{ payload: AiAnswerPayload }> = ({ payload }) => {
  const labels = payload.language === 'ar' ? LABELS_AR : LABELS_FR;
  const Icon = ICONS[payload.ai_kind];
  const dir = payload.language === 'ar' ? 'rtl' : 'ltr';

  const cleanSvg = useMemo(() => {
    if (payload.ai_kind !== 'infographic' || !payload.svg) return null;
    return DOMPurify.sanitize(payload.svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
  }, [payload]);

  const downloadSvg = () => {
    if (!cleanSvg) return;
    const blob = new Blob([cleanSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `infographic-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3" dir={dir}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="gap-1">
          <Bot className="h-3 w-3" /> AI
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Icon className="h-3 w-3" /> {labels[payload.ai_kind]}
        </Badge>
        {payload.model && (
          <span className="text-xs text-muted-foreground truncate">{payload.model}</span>
        )}
      </div>
      {payload.ai_kind === 'infographic' ? (
        <div className="space-y-2">
          <div
            className="rounded-lg border bg-card p-2 overflow-auto [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: cleanSvg ?? '' }}
          />
          <Button size="sm" variant="outline" onClick={downloadSvg} className="gap-1">
            <Download className="h-3 w-3" /> SVG
          </Button>
        </div>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none break-words">
          <ReactMarkdown>{payload.content || ''}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};