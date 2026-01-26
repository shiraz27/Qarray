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
  const sessionIdRef = useRef<string>(`${formType}-${sourceRoute}-${Date.now()}`);
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

  // Add uploaded URLs to session
  const addUploadedUrl = useCallback((url: string) => {
    const sessions = getSessions();
    const session = sessions[sessionIdRef.current];
    
    if (session) {
      if (!session.uploadedUrls.includes(url)) {
        session.uploadedUrls.push(url);
        session.updatedAt = Date.now();
        saveSessions(sessions);
      }
    } else {
      // Create session with just the URL
      sessions[sessionIdRef.current] = {
        id: sessionIdRef.current,
        formType,
        data: {},
        uploadedUrls: [url],
        sourceRoute,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveSessions(sessions);
    }
  }, [formType, sourceRoute]);

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
