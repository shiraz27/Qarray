import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n/config";
import Index from "./pages/Index";
import Login from "./pages/Login";
import CompleteProfile from "./pages/CompleteProfile";
import Bookmarks from "./pages/Bookmarks";
import Chapter from "./pages/Chapter";
import NotFound from "./pages/NotFound";
import DeleteBookmark from "./pages/DeleteBookmark";
import { useDataPreload } from "./hooks/useDataPreload";

const queryClient = new QueryClient();

const AppContent = () => {
  useDataPreload(); // Preload data on app launch
  
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route path="/bookmarks" element={<Bookmarks />} />
      <Route path="/chapter/:id" element={<Chapter />} />
      <Route path="/delete-bookmark" element={<DeleteBookmark />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <I18nextProvider i18n={i18n}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </I18nextProvider>
);

export default App;
