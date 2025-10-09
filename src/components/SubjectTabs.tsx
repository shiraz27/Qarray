import React, { useState, useEffect } from 'react';
import { Calculator, Atom, Code, BookOpen, Globe, Beaker, TestTube, FlaskConical, Plus, Edit } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MemorizeButton } from '@/components/MemorizeButton';
import { ManageSubjectDialog } from '@/components/ManageSubjectDialog';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';

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
};

const getIconForSubject = (logo: string | null, subjectName: string): LucideIcon => {
  if (logo && iconMap[logo.toLowerCase()]) {
    return iconMap[logo.toLowerCase()];
  }
  
  // Fallback based on subject name
  const nameLower = subjectName.toLowerCase();
  if (nameLower.includes('math')) return Calculator;
  if (nameLower.includes('phys') || nameLower.includes('chim')) return Atom;
  if (nameLower.includes('program') || nameLower.includes('info')) return Code;
  if (nameLower.includes('fran') || nameLower.includes('arab')) return BookOpen;
  if (nameLower.includes('angl') || nameLower.includes('alleman')) return Globe;
  if (nameLower.includes('scien')) return Beaker;
  
  return BookOpen; // Default icon
};

export const SubjectTabs: React.FC<SubjectTabsProps> = ({ classId, onSubjectChange }) => {
  const [activeSubject, setActiveSubject] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const { isModerator, isAdmin } = useUserRole();

  useEffect(() => {
    const fetchSubjects = async () => {
      if (!classId) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('subjects')
          .select('id, name, logo')
          .eq('class_id', classId)
          .eq('deleted', false)
          .order('name');

        if (error) throw error;
        
        setSubjects(data || []);
        if (data && data.length > 0) {
          setActiveSubject(data[0].id);
          onSubjectChange?.(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching subjects:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubjects();
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
    // Refetch subjects
    const refetch = async () => {
      if (!classId) return;
      
      try {
        const { data, error } = await supabase
          .from('subjects')
          .select('id, name, logo')
          .eq('class_id', classId)
          .eq('deleted', false)
          .order('name');

        if (error) throw error;
        
        setSubjects(data || []);
        if (data && data.length > 0 && !data.find(s => s.id === activeSubject)) {
          setActiveSubject(data[0].id);
          onSubjectChange?.(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching subjects:', error);
      }
    };
    refetch();
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
        <div className="flex w-full items-center gap-4 justify-start sm:justify-center rounded-xl min-w-max sm:min-w-0">
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
