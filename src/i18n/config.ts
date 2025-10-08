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
      error: "Error",
      profile: "Profile",
      language: "Language",
      logout: "Logout",
      deleteAccount: "Delete Account",
      deleteAccountConfirm: "Are you sure you want to delete your account? This action cannot be undone.",
      cancel: "Cancel",
      delete: "Delete",
      accountDeleted: "Account deleted successfully"
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
      error: "Erreur",
      profile: "Profil",
      language: "Langue",
      logout: "Déconnexion",
      deleteAccount: "Supprimer le compte",
      deleteAccountConfirm: "Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.",
      cancel: "Annuler",
      delete: "Supprimer",
      accountDeleted: "Compte supprimé avec succès"
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
      error: "خطأ",
      profile: "الملف الشخصي",
      language: "اللغة",
      logout: "تسجيل الخروج",
      deleteAccount: "حذف الحساب",
      deleteAccountConfirm: "هل أنت متأكد من رغبتك في حذف حسابك؟ هذا الإجراء لا يمكن التراجع عنه.",
      cancel: "إلغاء",
      delete: "حذف",
      accountDeleted: "تم حذف الحساب بنجاح"
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

// Set initial RTL direction
if (i18n.language === 'ar') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
}

export default i18n;
