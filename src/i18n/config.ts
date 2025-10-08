import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      welcomeBack: "Welcome Back",
      createAccount: "Create Account",
      signUpMessage: "Sign up to get started",
      signInMessage: "Sign in to continue",
      facebook: "Facebook",
      orWithEmail: "Or with email",
      email: "Email",
      password: "Password",
      signUp: "Sign Up",
      signIn: "Sign In",
      loading: "Loading...",
      alreadyHaveAccount: "Already have an account? Sign In",
      dontHaveAccount: "Don't have an account? Sign Up",
      success: "Success!",
      accountCreated: "Account created successfully. You can now sign in.",
      welcomeBackMessage: "You've successfully signed in.",
      error: "Error"
    }
  },
  fr: {
    translation: {
      welcomeBack: "Bienvenue",
      createAccount: "Créer un compte",
      signUpMessage: "Inscrivez-vous pour commencer",
      signInMessage: "Connectez-vous pour continuer",
      facebook: "Facebook",
      orWithEmail: "Ou avec e-mail",
      email: "E-mail",
      password: "Mot de passe",
      signUp: "S'inscrire",
      signIn: "Se connecter",
      loading: "Chargement...",
      alreadyHaveAccount: "Vous avez déjà un compte ? Se connecter",
      dontHaveAccount: "Vous n'avez pas de compte ? S'inscrire",
      success: "Succès !",
      accountCreated: "Compte créé avec succès. Vous pouvez maintenant vous connecter.",
      welcomeBackMessage: "Vous êtes connecté avec succès.",
      error: "Erreur"
    }
  },
  ar: {
    translation: {
      welcomeBack: "مرحباً بعودتك",
      createAccount: "إنشاء حساب",
      signUpMessage: "سجل للبدء",
      signInMessage: "تسجيل الدخول للمتابعة",
      facebook: "فيسبوك",
      orWithEmail: "أو عبر البريد الإلكتروني",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      signUp: "تسجيل",
      signIn: "تسجيل الدخول",
      loading: "جارٍ التحميل...",
      alreadyHaveAccount: "هل لديك حساب بالفعل؟ تسجيل الدخول",
      dontHaveAccount: "ليس لديك حساب؟ سجل",
      success: "نجح!",
      accountCreated: "تم إنشاء الحساب بنجاح. يمكنك الآن تسجيل الدخول.",
      welcomeBackMessage: "تم تسجيل الدخول بنجاح.",
      error: "خطأ"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
