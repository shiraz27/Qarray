import React from 'react';
import { Bot, Edit3, Clock, Zap, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ResourceUploadModeSelectorProps {
  onSelectMode: (mode: 'ai' | 'manual') => void;
}

export const ResourceUploadModeSelector: React.FC<ResourceUploadModeSelectorProps> = ({
  onSelectMode
}) => {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">How would you like to add this resource?</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Choose how to fill in the resource details
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AI Auto-Fill Option */}
        <Card 
          className="cursor-pointer border-2 hover:border-primary/50 transition-colors"
          onClick={() => onSelectMode('ai')}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">AI Auto-Fill</CardTitle>
            </div>
            <Badge variant="secondary" className="w-fit">
              <Clock className="h-3 w-3 mr-1" />
              15-30 seconds
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <CardDescription className="text-sm space-y-2">
              <p>Upload file(s) and AI will extract:</p>
              <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                <li>📝 Title</li>
                <li>🏫 School name</li>
                <li>👨‍🏫 Teacher name</li>
                <li>📂 Resource type</li>
                <li>📋 Devoir type</li>
              </ul>
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs mt-2">
                <AlertTriangle className="h-3 w-3" />
                <span>Takes longer but saves manual work</span>
              </div>
            </CardDescription>
          </CardContent>
        </Card>

        {/* Manual Fill Option */}
        <Card 
          className="cursor-pointer border-2 hover:border-primary/50 transition-colors"
          onClick={() => onSelectMode('manual')}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-secondary">
                <Edit3 className="h-5 w-5 text-secondary-foreground" />
              </div>
              <CardTitle className="text-base">Manual Fill</CardTitle>
            </div>
            <Badge variant="outline" className="w-fit">
              <Zap className="h-3 w-3 mr-1" />
              Instant submit
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            <CardDescription className="text-sm space-y-2">
              <p>Fill all fields yourself:</p>
              <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                <li>✏️ You control everything</li>
                <li>⚡ Fast submission</li>
                <li>🎯 Best for known content</li>
              </ul>
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs mt-2">
                <Zap className="h-3 w-3" />
                <span>Quick and immediate</span>
              </div>
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center gap-2 pt-2">
        <Button 
          variant="default" 
          onClick={() => onSelectMode('ai')}
          className="gap-2"
        >
          <Bot className="h-4 w-4" />
          Use AI Auto-Fill
        </Button>
        <Button 
          variant="outline" 
          onClick={() => onSelectMode('manual')}
          className="gap-2"
        >
          <Edit3 className="h-4 w-4" />
          Fill Manually
        </Button>
      </div>
    </div>
  );
};
