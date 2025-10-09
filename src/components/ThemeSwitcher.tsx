import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Palette, Check } from 'lucide-react';

interface ThemeSwitcherProps {
  userId?: string;
  showLabel?: boolean;
  compact?: boolean;
}

const themes = [
  { id: 'blue', name: 'Blue', color: 'hsl(207 89% 54%)' },
  { id: 'pink', name: 'Pink', color: '#F6A18A' },
  { id: 'green', name: 'Green', color: 'hsl(142 76% 36%)' },
  { id: 'black', name: 'Black', color: 'hsl(0 0% 20%)' },
  { id: 'custom', name: 'Custom', color: null },
];

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ 
  userId, 
  showLabel = true,
  compact = false 
}) => {
  const [currentTheme, setCurrentTheme] = useState('blue');
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [isCustomMode, setIsCustomMode] = useState(false);

  useEffect(() => {
    // Load current theme from profile or localStorage
    const loadTheme = async () => {
      if (userId) {
        const { data } = await supabase
          .from('profiles')
          .select('theme, custom_theme_color')
          .eq('user_id', userId)
          .single();
        
        if (data) {
          setCurrentTheme(data.theme || 'blue');
          if (data.custom_theme_color) {
            setCustomColor(data.custom_theme_color);
          }
          applyTheme(data.theme || 'blue', data.custom_theme_color);
        }
      } else {
        const savedTheme = localStorage.getItem('theme') || 'blue';
        const savedCustomColor = localStorage.getItem('customThemeColor');
        setCurrentTheme(savedTheme);
        if (savedCustomColor) {
          setCustomColor(savedCustomColor);
        }
        applyTheme(savedTheme, savedCustomColor);
      }
    };

    loadTheme();
  }, [userId]);

  const applyTheme = (theme: string, customColor?: string | null) => {
    const root = document.documentElement;
    
    if (theme === 'custom' && customColor) {
      // Convert hex to HSL and apply custom theme
      const hsl = hexToHSL(customColor);
      root.style.setProperty('--primary', hsl);
      root.style.setProperty('--accent', hsl);
      root.style.setProperty('--ring', hsl);
      root.setAttribute('data-theme', 'custom');
    } else {
      root.setAttribute('data-theme', theme);
    }
  };

  const hexToHSL = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '207 89% 54%';

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  const handleThemeChange = async (themeId: string) => {
    setCurrentTheme(themeId);
    setIsCustomMode(themeId === 'custom');
    
    if (themeId !== 'custom') {
      applyTheme(themeId);
      
      if (userId) {
        await supabase
          .from('profiles')
          .update({ theme: themeId, custom_theme_color: null })
          .eq('user_id', userId);
        toast.success('Theme updated successfully');
      } else {
        localStorage.setItem('theme', themeId);
      }
    }
  };

  const handleCustomColorChange = async (color: string) => {
    setCustomColor(color);
    applyTheme('custom', color);
    
    if (userId) {
      await supabase
        .from('profiles')
        .update({ theme: 'custom', custom_theme_color: color })
        .eq('user_id', userId);
      toast.success('Custom theme applied');
    } else {
      localStorage.setItem('theme', 'custom');
      localStorage.setItem('customThemeColor', color);
    }
  };

  if (compact) {
    return (
      <div className="flex gap-2 flex-wrap">
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => handleThemeChange(theme.id)}
            className={`w-10 h-10 rounded-lg border-2 transition-all cursor-pointer hover:scale-110 ${
              currentTheme === theme.id ? 'border-foreground scale-110' : 'border-border'
            }`}
            style={theme.color ? { backgroundColor: theme.color } : undefined}
            title={theme.name}
            type="button"
          >
            {theme.id === 'custom' && <Palette className="w-4 h-4 mx-auto" />}
            {currentTheme === theme.id && (
              <Check className="w-5 h-5 mx-auto text-white drop-shadow-md" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showLabel && (
        <Label className="text-base font-semibold">Choose Your Theme</Label>
      )}
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {themes.map((theme) => (
          <Card
            key={theme.id}
            onClick={() => handleThemeChange(theme.id)}
            className={`cursor-pointer p-4 hover:shadow-lg transition-all ${
              currentTheme === theme.id ? 'ring-2 ring-primary' : ''
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              {theme.id === 'custom' ? (
                <div className="w-12 h-12 rounded-full border-2 border-border flex items-center justify-center">
                  <Palette className="w-6 h-6" />
                </div>
              ) : (
                <div
                  className="w-12 h-12 rounded-full"
                  style={{ backgroundColor: theme.color || undefined }}
                />
              )}
              <span className="text-sm font-medium">{theme.name}</span>
              {currentTheme === theme.id && (
                <Check className="w-4 h-4 text-primary" />
              )}
            </div>
          </Card>
        ))}
      </div>

      {isCustomMode && (
        <div className="space-y-2">
          <Label htmlFor="customColor">Custom Color</Label>
          <div className="flex gap-2">
            <Input
              id="customColor"
              type="color"
              value={customColor}
              onChange={(e) => handleCustomColorChange(e.target.value)}
              className="w-20 h-12 cursor-pointer"
            />
            <Input
              type="text"
              value={customColor}
              onChange={(e) => {
                if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                  handleCustomColorChange(e.target.value);
                }
              }}
              placeholder="#ec4899"
              className="flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
};
