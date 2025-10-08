import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

export const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation();

  const languages = [
    { code: 'en', label: 'EN' },
    { code: 'fr', label: 'FR' },
    { code: 'ar', label: 'AR' }
  ];

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  };

  return (
    <div className="flex items-center gap-2">
      <Globe className="w-4 h-4 text-gray-600" />
      {languages.map((lang) => (
        <Button
          key={lang.code}
          onClick={() => changeLanguage(lang.code)}
          variant={i18n.language === lang.code ? 'default' : 'ghost'}
          size="sm"
          className="h-8 px-3"
        >
          {lang.label}
        </Button>
      ))}
    </div>
  );
};
