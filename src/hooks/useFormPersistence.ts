import { useState, useEffect, useCallback, useRef } from 'react';

export interface FormSession {
  id: string;
  formType: string;
  data: Record<string, any>;
  uploadedUrls: string[];
  sourceRoute: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'qarray_form_sessions';
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Get all sessions from localStorage
const getSessions = (): Record<string, FormSession> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const sessions = JSON.parse(stored);
    
    // Clean up expired sessions
    const now = Date.now();
    const validSessions: Record<string, FormSession> = {};
    Object.entries(sessions).forEach(([key, session]: [string, any]) => {
      if (now - session.updatedAt < SESSION_EXPIRY_MS) {
        validSessions[key] = session;
      }
    });
    
    return validSessions;
  } catch {
    return {};
  }
};

// Save sessions to localStorage
const saveSessions = (sessions: Record<string, FormSession>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error('Failed to save form sessions:', e);
  }
};

export const useFormPersistence = (
  formType: string,
  sourceRoute: string
) => {
  // Use a stable session ID based on formType and sourceRoute (not timestamp)
  const sessionIdRef = useRef<string>(`${formType}-${sourceRoute}`);
  const [isRestored, setIsRestored] = useState(false);
  const [restoredData, setRestoredData] = useState<FormSession | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const sessions = getSessions();
    
    // Find a session matching this form type and route
    const existingSession = Object.values(sessions).find(
      s => s.formType === formType && s.sourceRoute === sourceRoute
    );
    
    if (existingSession) {
      sessionIdRef.current = existingSession.id;
      setRestoredData(existingSession);
      console.log('[FormPersistence] Found existing session:', existingSession);
    } else {
      console.log('[FormPersistence] No existing session for', formType, sourceRoute);
    }
    
    setIsRestored(true);
  }, [formType, sourceRoute]);

  // Save form data
  const saveFormData = useCallback((data: Record<string, any>, uploadedUrls: string[] = []) => {
    const sessions = getSessions();
    const now = Date.now();
    
    sessions[sessionIdRef.current] = {
      id: sessionIdRef.current,
      formType,
      data,
      uploadedUrls,
      sourceRoute,
      createdAt: sessions[sessionIdRef.current]?.createdAt || now,
      updatedAt: now,
    };
    
    saveSessions(sessions);
  }, [formType, sourceRoute]);

  // Clear form session
  const clearFormSession = useCallback(() => {
    const sessions = getSessions();
    delete sessions[sessionIdRef.current];
    saveSessions(sessions);
    setRestoredData(null);
  }, []);

  // Add uploaded URLs to session (DEPRECATED - use saveFormData instead)
  // Keeping for backwards compatibility but saveFormData is the single source of truth
  const addUploadedUrl = useCallback((url: string) => {
    // No-op: saveFormData handles all URL persistence now
    // This prevents duplicate URL issues from race conditions
    console.log('[FormPersistence] addUploadedUrl called (no-op):', url);
  }, []);

  // Remove uploaded URL from session (for when files are manually deleted from form)
  const removeUploadedUrl = useCallback((url: string) => {
    const sessions = getSessions();
    const session = sessions[sessionIdRef.current];
    
    if (session) {
      session.uploadedUrls = session.uploadedUrls.filter(u => u !== url);
      session.updatedAt = Date.now();
      saveSessions(sessions);
    }
  }, []);

  // Get pending sessions for a route (for the indicator to check)
  const getPendingSession = useCallback((): FormSession | null => {
    const sessions = getSessions();
    return Object.values(sessions).find(
      s => s.formType === formType && s.sourceRoute === sourceRoute && s.uploadedUrls.length > 0
    ) || null;
  }, [formType, sourceRoute]);

  return {
    sessionId: sessionIdRef.current,
    isRestored,
    restoredData,
    saveFormData,
    clearFormSession,
    addUploadedUrl,
    removeUploadedUrl,
    getPendingSession,
  };
};

// Utility to get all pending form sessions
export const getAllPendingSessions = (): FormSession[] => {
  const sessions = getSessions();
  return Object.values(sessions).filter(s => s.uploadedUrls.length > 0);
};

// Utility to get session by route
export const getSessionByRoute = (route: string): FormSession | null => {
  const sessions = getSessions();
  return Object.values(sessions).find(s => s.sourceRoute === route) || null;
};

// Utility to get session by form type
export const getSessionByFormType = (formType: string): FormSession | null => {
  const sessions = getSessions();
  return Object.values(sessions).find(s => s.formType === formType && s.uploadedUrls.length > 0) || null;
};

// Check if there's a pending global form session (for dialog-based forms)
export const hasPendingGlobalFormSession = (): boolean => {
  const sessions = getSessions();
  return Object.values(sessions).some(
    s => s.formType.includes('Global') && s.uploadedUrls.length > 0
  );
};
