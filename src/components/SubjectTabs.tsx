import React, { useState, useEffect } from 'react';
import { Calculator, Atom, Code, BookOpen, Globe, Beaker, TestTube, FlaskConical, Plus, Edit, Database } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLibraryData } from '@/contexts/LibraryDataContext';
import { MemorizeButton } from '@/components/MemorizeButton';
import { ManageSubjectDialog } from '@/components/ManageSubjectDialog';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { normalizeText } from '@/utils/textHelpers';

interface Subject {
  id: number;
  name: string;
  logo: string | null;
}

interface SubjectTabsProps {
  classId?: number;
  onSubjectChange?: (subjectId: number) => void;
}

const iconMap: Record<string, LucideIcon> = {
  'calculator': Calculator,
  'atom': Atom,
  'code': Code,
  'book-open': BookOpen,
  'globe': Globe,
  'beaker': Beaker,
  'test-tube': TestTube,
  'flask-conical': FlaskConical,
  'database': Database
};

const getIconForSubject = (logo: string | null, subjectName: string): LucideIcon => {
  if (logo && iconMap[normalizeText(logo)]) {
    return iconMap[normalizeText(logo)];
  }
  
  // Fallback based on subject name
  const nameLower = normalizeText(subjectName);
  if (nameLower.includes('math')) return Calculator;
  if (nameLower.includes('phys') || nameLower.includes('chim')) return Atom;
  if (nameLower.includes('program') || nameLower.includes('info')) return Code;
  if (nameLower.includes('fran') || nameLower.includes('arab')) return BookOpen;
  if (nameLower.includes('angl') || nameLower.includes('alleman')) return Globe;
  if (nameLower.includes('scien')) return Beaker;
  
  return BookOpen; // Default icon
};

export const SubjectTabs: React.FC<SubjectTabsProps> = ({ classId, onSubjectChange }) => {
  const { ensureSubjects, invalidateSubjects, getSubjectsFromCache } = useLibraryData();
  const [activeSubject, setActiveSubject] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const { isModerator, isAdmin } = useUserRole();

  useEffect(() => {
    const load = async () => {
      if (!classId) return;

      const cached = getSubjectsFromCache(classId);
      if (cached) {
        setSubjects(cached);
        if (cached.length > 0 && !cached.find(s => s.id === activeSubject)) {
          setActiveSubject(cached[0].id);
          onSubjectChange?.(cached[0].id);
        }
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await ensureSubjects(classId);
        setSubjects(data);
        if (data.length > 0) {
          setActiveSubject(data[0].id);
          onSubjectChange?.(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching subjects:', error);
      } finally {
        setLoading(false);
      }
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const handleSubjectClick = (subjectId: number) => {
    setActiveSubject(subjectId);
    onSubjectChange?.(subjectId);
  };

  const handleAddSubject = () => {
    setEditingSubjectId(null);
    setManageDialogOpen(true);
  };

  const handleEditSubject = (subjectId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSubjectId(subjectId);
    setManageDialogOpen(true);
  };

  const handleDialogClose = () => {
    setManageDialogOpen(false);
    setEditingSubjectId(null);
  };

  const handleSuccess = () => {
    // Explicit mutation: invalidate cache so next load refreshes.
    invalidateSubjects(classId);

    if (!classId) return;
    setLoading(true);
    void ensureSubjects(classId)
      .then((data) => {
        setSubjects(data);
        if (data.length > 0 && !data.find(s => s.id === activeSubject)) {
          setActiveSubject(data[0].id);
          onSubjectChange?.(data[0].id);
        }
      })
      .catch((error) => {
        console.error('Error fetching subjects:', error);
      })
      .finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <nav className="w-full text-xs px-2.5 py-4" aria-label="Subject navigation">
        <div className="flex w-full items-center gap-4 justify-center">
          <div className="text-gray-500">Loading subjects...</div>
        </div>
      </nav>
    );
  }

  if (subjects.length === 0) {
    return (
      <nav className="w-full text-xs px-2.5 py-4" aria-label="Subject navigation">
        <div className="flex w-full items-center gap-4 justify-center">
          <div className="text-gray-500">No subjects available</div>
        </div>
      </nav>
    );
  }

  return (
    <div className="w-full">
      <nav className="w-full text-xs text-[#BDBDBD] font-normal text-center tracking-[0.2px] leading-[1.6] px-2.5 py-4 overflow-x-auto" aria-label="Subject navigation">
        <div className="flex w-full items-center gap-4 justify-center rounded-xl min-w-max sm:min-w-0">
          {(isModerator || isAdmin) && (
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 h-16 w-16 rounded-full"
              onClick={handleAddSubject}
              title="Add Subject"
            >
              <Plus size={20} />
            </Button>
          )}
          {subjects.map((subject) => {
          const isActive = activeSubject === subject.id;
          const Icon = getIconForSubject(subject.logo, subject.name);
          
          return (
            <div key={subject.id} className="relative group">
              <button
                className={`items-center flex flex-col flex-shrink-0 sm:flex-1 pb-2 min-w-0 transition-all duration-300 ${
                  isActive 
                    ? 'text-primary font-semibold border-b-2 border-primary scale-110' 
                    : 'text-muted-foreground border-b-2 border-transparent hover:text-primary hover:scale-105'
                }`}
                onClick={() => handleSubjectClick(subject.id)}
                aria-pressed={isActive}
                aria-label={`Select ${subject.name} subject`}
              >
                <Icon
                  size={24}
                  className={`transition-all duration-300 ${
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
                  }`}
                />
                <span className="mt-1 max-w-[100px] truncate">
                  {subject.name}
                </span>
              </button>
              {(isModerator || isAdmin) && (
                <button
                  className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground rounded-full p-1 hover:bg-primary/90"
                  onClick={(e) => handleEditSubject(subject.id, e)}
                  title="Edit Subject"
                >
                  <Edit size={12} />
                </button>
              )}
            </div>
          );
        })}
        </div>
      </nav>
      
      {activeSubject && (
        <div className="px-4 pb-2">
          <MemorizeButton subjectId={activeSubject} />
        </div>
      )}

      {classId && (
        <ManageSubjectDialog
          open={manageDialogOpen}
          onClose={handleDialogClose}
          classId={classId}
          subjectId={editingSubjectId}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};
