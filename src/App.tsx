import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
import i18n from "./i18n/config";
import { UploadManagerProvider } from "./contexts/UploadManagerContext";
import { UploadStatusIndicator } from "./components/UploadStatusIndicator";
import { LibraryDataProvider } from "./contexts/LibraryDataContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import CompleteProfile from "./pages/CompleteProfile";
import Bookmarks from "./pages/Bookmarks";
import Classmates from "./pages/Classmates";
import Chapter from "./pages/Chapter";
import QuestionDetail from "./pages/QuestionDetail";
import ResourceDetail from "./pages/ResourceDetail";
import Profile from "./pages/Profile";
import Moderation from "./pages/Moderation";
import Statistics from "./pages/Statistics";
import NotFound from "./pages/NotFound";
import DeleteBookmark from "./pages/DeleteBookmark";
import MemorizationDetail from "./pages/MemorizationDetail";
import { useDataPreload } from "./hooks/useDataPreload";

const queryClient = new QueryClient();

const AppContent = () => {
  useDataPreload(); // Preload data on app launch
  
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route path="/bookmarks" element={<Bookmarks />} />
      <Route path="/classmates" element={<Classmates />} />
      <Route path="/chapter/:id" element={<Chapter />} />
      <Route path="/question/:id" element={<QuestionDetail />} />
      <Route path="/resource/:id" element={<ResourceDetail />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/moderation" element={<Moderation />} />
      <Route path="/statistics" element={<Statistics />} />
      <Route path="/delete-bookmark" element={<DeleteBookmark />} />
      <Route path="/memorization/:id" element={<MemorizationDetail />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <HelmetProvider>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <LibraryDataProvider>
            <UploadManagerProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AppContent />
                <UploadStatusIndicator />
              </BrowserRouter>
            </TooltipProvider>
            </UploadManagerProvider>
          </LibraryDataProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ThemeProvider>
  </HelmetProvider>
);

export default App;
