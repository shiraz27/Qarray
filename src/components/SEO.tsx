import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

const BASE_URL = 'https://qarray.lovable.app';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

interface SEOProps {
  title?: string;
  description?: string;
  type?: 'website' | 'article' | 'profile';
  image?: string;
  url?: string;
  jsonLd?: object;
  noindex?: boolean;
}

export const SEO = ({
  title,
  description,
  type = 'website',
  image = DEFAULT_IMAGE,
  url,
  jsonLd,
  noindex = false,
}: SEOProps) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  
  const defaultTitle = 'Qarray - Educational Learning Platform';
  const defaultDescription = 'The ultimate platform for high school students to collaborate, learn, and excel together.';
  
  const fullTitle = title ? `${title} | Qarray` : defaultTitle;
  const fullDescription = description || defaultDescription;
  const currentUrl = url ? `${BASE_URL}${url}` : BASE_URL;
  
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

export const createCourseSchema = (name: string, description: string, url: string) => ({
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
  educationalLevel: 'High School',
  inLanguage: ['en', 'fr', 'ar'],
});

export const createQAPageSchema = (question: string, answerCount: number, url: string) => ({
  '@context': 'https://schema.org',
  '@type': 'QAPage',
  mainEntity: {
    '@type': 'Question',
    name: question,
    text: question,
    answerCount,
    url: `${BASE_URL}${url}`,
  },
});

export const createLearningResourceSchema = (
  name: string,
  description: string,
  url: string,
  resourceType?: string
) => ({
  '@context': 'https://schema.org',
  '@type': 'LearningResource',
  name,
  description,
  url: `${BASE_URL}${url}`,
  educationalLevel: 'High School',
  learningResourceType: resourceType || 'Study Guide',
  provider: {
    '@type': 'Organization',
    name: 'Qarray',
  },
});

export default SEO;
