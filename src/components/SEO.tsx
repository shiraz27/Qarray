import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

const BASE_URL = 'https://qarray.lovable.app';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

// Tunisia-related keywords for local SEO
export const TUNISIA_KEYWORDS = [
  'Tunisia', 'Tunisie', 'تونس', 
  'Tunisian education', 'éducation tunisienne', 'التعليم التونسي',
  'baccalauréat tunisien', 'bac tunisie', 'باكالوريا تونس'
];

interface SEOProps {
  title?: string;
  description?: string;
  type?: 'website' | 'article' | 'profile';
  image?: string;
  url?: string;
  jsonLd?: object;
  noindex?: boolean;
  keywords?: string[];
  articleContent?: string;
}

export const SEO = ({
  title,
  description,
  type = 'website',
  image = DEFAULT_IMAGE,
  url,
  jsonLd,
  noindex = false,
  keywords = [],
}: SEOProps) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  
  const defaultTitle = 'Qarray - Educational Learning Platform';
  const defaultDescription = 'The ultimate platform for high school students to collaborate, learn, and excel together.';
  
  const fullTitle = title ? `${title} | Qarray` : defaultTitle;
  const fullDescription = description || defaultDescription;
  const currentUrl = url ? `${BASE_URL}${url}` : BASE_URL;
  
  // Combine provided keywords with Tunisia keywords
  const allKeywords = [...new Set([...keywords, ...TUNISIA_KEYWORDS])].filter(Boolean);
  
  // Generate hreflang URLs
  const languages = ['en', 'fr', 'ar'];
  
  // Default organization JSON-LD
  const defaultJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'Qarray',
    description: defaultDescription,
    url: BASE_URL,
    logo: `${BASE_URL}/qarray-logo-new.png`,
    sameAs: [],
  };

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <html lang={currentLang} dir={currentLang === 'ar' ? 'rtl' : 'ltr'} />
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      
      {/* Keywords Meta Tag */}
      {allKeywords.length > 0 && (
        <meta name="keywords" content={allKeywords.join(', ')} />
      )}
      
      {/* Canonical URL */}
      <link rel="canonical" href={currentUrl} />
      
      {/* Hreflang Tags for Multilingual Support */}
      {languages.map((lang) => (
        <link
          key={lang}
          rel="alternate"
          hrefLang={lang}
          href={`${currentUrl}${currentUrl.includes('?') ? '&' : '?'}lang=${lang}`}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={currentUrl} />
      
      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content="Qarray" />
      <meta property="og:locale" content={currentLang === 'ar' ? 'ar_SA' : currentLang === 'fr' ? 'fr_FR' : 'en_US'} />
      {languages.filter(l => l !== currentLang).map((lang) => (
        <meta
          key={`og-locale-${lang}`}
          property="og:locale:alternate"
          content={lang === 'ar' ? 'ar_SA' : lang === 'fr' ? 'fr_FR' : 'en_US'}
        />
      ))}
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@qarray_app" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={image} />
      
      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify(jsonLd || defaultJsonLd)}
      </script>
    </Helmet>
  );
};

// Helper functions for creating JSON-LD schemas
export const createWebPageSchema = (name: string, description: string, url: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name,
  description,
  url: `${BASE_URL}${url}`,
  inLanguage: ['en', 'fr', 'ar'],
  isPartOf: {
    '@type': 'WebSite',
    name: 'Qarray',
    url: BASE_URL,
  },
});

export const createCourseSchema = (
  name: string,
  description: string,
  url: string,
  options?: {
    className?: string;
    subjectName?: string;
    partNames?: string[];
  }
) => ({
  '@context': 'https://schema.org',
  '@type': 'Course',
  name,
  description,
  url: `${BASE_URL}${url}`,
  provider: {
    '@type': 'Organization',
    name: 'Qarray',
    url: BASE_URL,
  },
  educationalLevel: options?.className || 'High School',
  inLanguage: ['en', 'fr', 'ar'],
  hasPart: options?.partNames?.slice(0, 10).map(partName => ({
    '@type': 'LearningResource',
    name: partName
  })),
  locationCreated: {
    '@type': 'Country',
    name: 'Tunisia'
  },
  keywords: [...TUNISIA_KEYWORDS, options?.className, options?.subjectName].filter(Boolean),
  about: options?.subjectName ? {
    '@type': 'Thing',
    name: options.subjectName
  } : undefined,
});

export const createQAPageSchema = (
  question: string,
  answerCount: number,
  url: string,
  options?: {
    answers?: string[];
    className?: string;
    subjectName?: string;
    chapterName?: string;
  }
) => ({
  '@context': 'https://schema.org',
  '@type': 'QAPage',
  mainEntity: {
    '@type': 'Question',
    name: question.substring(0, 200),
    text: question,
    answerCount,
    url: `${BASE_URL}${url}`,
    acceptedAnswer: options?.answers?.[0] ? {
      '@type': 'Answer',
      text: options.answers[0].substring(0, 1000)
    } : undefined,
    suggestedAnswer: options?.answers?.slice(1, 4).map(a => ({
      '@type': 'Answer',
      text: a.substring(0, 500)
    }))
  },
  about: options?.subjectName ? {
    '@type': 'Thing',
    name: options.subjectName
  } : undefined,
  keywords: [...TUNISIA_KEYWORDS, options?.className, options?.subjectName, options?.chapterName].filter(Boolean),
  locationCreated: {
    '@type': 'Country',
    name: 'Tunisia'
  },
});

export const createLearningResourceSchema = (
  name: string,
  description: string,
  url: string,
  resourceType?: string,
  options?: {
    textContent?: string;
    className?: string;
    subjectName?: string;
    chapterName?: string;
    keywords?: string[];
  }
) => ({
  '@context': 'https://schema.org',
  '@type': 'LearningResource',
  name,
  description,
  url: `${BASE_URL}${url}`,
  educationalLevel: options?.className || 'High School',
  learningResourceType: resourceType || 'Study Guide',
  text: options?.textContent?.substring(0, 5000),
  keywords: [...TUNISIA_KEYWORDS, ...(options?.keywords || []), options?.className, options?.subjectName, options?.chapterName].filter(Boolean),
  about: options?.subjectName ? {
    '@type': 'Thing',
    name: options.subjectName
  } : undefined,
  isPartOf: options?.chapterName ? {
    '@type': 'Course',
    name: options.chapterName
  } : undefined,
  provider: {
    '@type': 'Organization',
    name: 'Qarray',
    url: BASE_URL,
  },
  locationCreated: {
    '@type': 'Country',
    name: 'Tunisia'
  },
});

export default SEO;
