import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "fr" | "ar";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations = {
  en: {
    // Auth Page
    "auth.title": "Qarray",
    "auth.subtitle": "E-Learning Platform",
    "auth.login": "Login",
    "auth.signup": "Sign Up",
    "auth.loginTitle": "Login",
    "auth.signupTitle": "Create Account",
    "auth.loginSubtitle": "Enter your credentials",
    "auth.signupSubtitle": "Create your new account",
    "auth.fullName": "Full Name",
    "auth.fullNamePlaceholder": "Enter your full name",
    "auth.email": "Email",
    "auth.emailPlaceholder": "example@email.com",
    "auth.password": "Password",
    "auth.passwordPlaceholder": "••••••••",
    "auth.passwordHint": "Password must be at least 6 characters",
    "auth.loginButton": "Login",
    "auth.signupButton": "Create Account",
    "auth.loading": "Loading...",
    "auth.noAccount": "Don't have an account? Sign up",
    "auth.hasAccount": "Already have an account? Login",
    "auth.terms": "By logging in, you agree to our",
    "auth.termsLink": "Terms of Service",
    "auth.and": "and",
    "auth.privacyLink": "Privacy Policy",
    
    // Validation & Errors
    "error.invalidEmail": "Invalid email",
    "error.invalidEmailDesc": "Please enter a valid email address",
    "error.invalidPassword": "Invalid password",
    "error.invalidPasswordDesc": "Password must be at least 6 characters",
    "error.loginFailed": "Login failed",
    "error.invalidCredentials": "Invalid email or password",
    "error.error": "Error",
    "error.fullNameRequired": "Full name required",
    "error.fullNameRequiredDesc": "Please enter your full name",
    "error.accountExists": "Account exists",
    "error.accountExistsDesc": "This email is already registered. Please login instead.",
    "error.signupFailed": "Signup failed",
    
    // Success Messages
    "success.welcomeBack": "Welcome back!",
    "success.welcomeBackDesc": "You've successfully logged in",
    "success.accountCreated": "Account created!",
    "success.accountCreatedDesc": "Welcome to Qarray",
    "success.loggedOut": "Logged out",
    "success.loggedOutDesc": "You've been logged out successfully",
    
    // Home Page
    "home.title": "Qarray",
    "home.subtitle": "E-Learning Platform",
    "home.logout": "Logout",
    "home.welcome": "Welcome",
    "home.subjects": "Subjects",
    "home.subjectsDesc": "Browse subjects and educational content",
    "home.resources": "Educational Resources",
    "home.resourcesDesc": "Access lessons, exercises and summaries",
    "home.profile": "Profile",
    "home.profileDesc": "Manage your personal information and settings",
    "home.stats": "Your Statistics",
    "home.statsSubjects": "Subjects",
    "home.statsLessons": "Lessons",
    "home.statsExercises": "Exercises",
    "home.statsSummaries": "Summaries",
  },
  fr: {
    // Auth Page
    "auth.title": "Qarray",
    "auth.subtitle": "Plateforme d'apprentissage en ligne",
    "auth.login": "Connexion",
    "auth.signup": "Inscription",
    "auth.loginTitle": "Connexion",
    "auth.signupTitle": "Créer un compte",
    "auth.loginSubtitle": "Entrez vos identifiants",
    "auth.signupSubtitle": "Créez votre nouveau compte",
    "auth.fullName": "Nom complet",
    "auth.fullNamePlaceholder": "Entrez votre nom complet",
    "auth.email": "Email",
    "auth.emailPlaceholder": "exemple@email.com",
    "auth.password": "Mot de passe",
    "auth.passwordPlaceholder": "••••••••",
    "auth.passwordHint": "Le mot de passe doit contenir au moins 6 caractères",
    "auth.loginButton": "Se connecter",
    "auth.signupButton": "Créer un compte",
    "auth.loading": "Chargement...",
    "auth.noAccount": "Pas de compte ? Inscrivez-vous",
    "auth.hasAccount": "Vous avez déjà un compte ? Connectez-vous",
    "auth.terms": "En vous connectant, vous acceptez nos",
    "auth.termsLink": "Conditions d'utilisation",
    "auth.and": "et",
    "auth.privacyLink": "Politique de confidentialité",
    
    // Validation & Errors
    "error.invalidEmail": "Email invalide",
    "error.invalidEmailDesc": "Veuillez entrer une adresse email valide",
    "error.invalidPassword": "Mot de passe invalide",
    "error.invalidPasswordDesc": "Le mot de passe doit contenir au moins 6 caractères",
    "error.loginFailed": "Échec de la connexion",
    "error.invalidCredentials": "Email ou mot de passe invalide",
    "error.error": "Erreur",
    "error.fullNameRequired": "Nom complet requis",
    "error.fullNameRequiredDesc": "Veuillez entrer votre nom complet",
    "error.accountExists": "Le compte existe",
    "error.accountExistsDesc": "Cet email est déjà enregistré. Veuillez vous connecter.",
    "error.signupFailed": "Échec de l'inscription",
    
    // Success Messages
    "success.welcomeBack": "Bon retour !",
    "success.welcomeBackDesc": "Vous vous êtes connecté avec succès",
    "success.accountCreated": "Compte créé !",
    "success.accountCreatedDesc": "Bienvenue sur Qarray",
    "success.loggedOut": "Déconnecté",
    "success.loggedOutDesc": "Vous avez été déconnecté avec succès",
    
    // Home Page
    "home.title": "Qarray",
    "home.subtitle": "Plateforme d'apprentissage en ligne",
    "home.logout": "Déconnexion",
    "home.welcome": "Bienvenue",
    "home.subjects": "Matières",
    "home.subjectsDesc": "Parcourir les matières et le contenu éducatif",
    "home.resources": "Ressources pédagogiques",
    "home.resourcesDesc": "Accéder aux cours, exercices et résumés",
    "home.profile": "Profil",
    "home.profileDesc": "Gérer vos informations personnelles et paramètres",
    "home.stats": "Vos statistiques",
    "home.statsSubjects": "Matières",
    "home.statsLessons": "Cours",
    "home.statsExercises": "Exercices",
    "home.statsSummaries": "Résumés",
  },
  ar: {
    // Auth Page
    "auth.title": "Qarray",
    "auth.subtitle": "منصة التعليم الإلكتروني",
    "auth.login": "تسجيل الدخول",
    "auth.signup": "إنشاء حساب",
    "auth.loginTitle": "تسجيل الدخول",
    "auth.signupTitle": "إنشاء حساب",
    "auth.loginSubtitle": "أدخل بيانات الدخول الخاصة بك",
    "auth.signupSubtitle": "قم بإنشاء حسابك الجديد",
    "auth.fullName": "الاسم الكامل",
    "auth.fullNamePlaceholder": "أدخل اسمك الكامل",
    "auth.email": "البريد الإلكتروني",
    "auth.emailPlaceholder": "example@email.com",
    "auth.password": "كلمة المرور",
    "auth.passwordPlaceholder": "••••••••",
    "auth.passwordHint": "يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل",
    "auth.loginButton": "تسجيل الدخول",
    "auth.signupButton": "إنشاء حساب",
    "auth.loading": "جاري التحميل...",
    "auth.noAccount": "ليس لديك حساب؟ سجل الآن",
    "auth.hasAccount": "لديك حساب بالفعل؟ سجل الدخول",
    "auth.terms": "بتسجيل الدخول، أنت توافق على",
    "auth.termsLink": "شروط الخدمة",
    "auth.and": "و",
    "auth.privacyLink": "سياسة الخصوصية",
    
    // Validation & Errors
    "error.invalidEmail": "بريد إلكتروني غير صالح",
    "error.invalidEmailDesc": "الرجاء إدخال عنوان بريد إلكتروني صالح",
    "error.invalidPassword": "كلمة مرور غير صالحة",
    "error.invalidPasswordDesc": "يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل",
    "error.loginFailed": "فشل تسجيل الدخول",
    "error.invalidCredentials": "بريد إلكتروني أو كلمة مرور غير صالحة",
    "error.error": "خطأ",
    "error.fullNameRequired": "الاسم الكامل مطلوب",
    "error.fullNameRequiredDesc": "الرجاء إدخال اسمك الكامل",
    "error.accountExists": "الحساب موجود",
    "error.accountExistsDesc": "هذا البريد الإلكتروني مسجل بالفعل. الرجاء تسجيل الدخول.",
    "error.signupFailed": "فشل إنشاء الحساب",
    
    // Success Messages
    "success.welcomeBack": "مرحباً بعودتك!",
    "success.welcomeBackDesc": "تم تسجيل دخولك بنجاح",
    "success.accountCreated": "تم إنشاء الحساب!",
    "success.accountCreatedDesc": "مرحباً بك في Qarray",
    "success.loggedOut": "تم تسجيل الخروج",
    "success.loggedOutDesc": "تم تسجيل خروجك بنجاح",
    
    // Home Page
    "home.title": "Qarray",
    "home.subtitle": "منصة التعليم الإلكتروني",
    "home.logout": "تسجيل الخروج",
    "home.welcome": "مرحباً",
    "home.subjects": "المواد الدراسية",
    "home.subjectsDesc": "تصفح المواد الدراسية والمحتوى التعليمي",
    "home.resources": "الموارد التعليمية",
    "home.resourcesDesc": "الوصول إلى الدروس والتمارين والملخصات",
    "home.profile": "الملف الشخصي",
    "home.profileDesc": "إدارة معلوماتك الشخصية وإعداداتك",
    "home.stats": "إحصائياتك",
    "home.statsSubjects": "المواد",
    "home.statsLessons": "الدروس",
    "home.statsExercises": "التمارين",
    "home.statsSummaries": "الملخصات",
  },
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("qarray-language");
    return (saved as Language) || "ar";
  });

  useEffect(() => {
    localStorage.setItem("qarray-language", language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  const isRTL = language === "ar";

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
