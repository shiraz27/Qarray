import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AskQuestionGlobalForm } from './AskQuestionGlobalForm';
import { AddResourceGlobalForm } from './AddResourceGlobalForm';
import { supabase } from '@/integrations/supabase/client';
import { MemorizeButton } from './MemorizeButton';
import { getActivePendingFormType } from '@/hooks/useFormPersistence';

export const ActionButtons: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAskDialogOpen, setIsAskDialogOpen] = useState(false);
  const [isAddResourceDialogOpen, setIsAddResourceDialogOpen] = useState(false);
  const [resourceTypes, setResourceTypes] = useState<Array<{ id: number; type: string }>>([]);
  const [devoirTypes, setDevoirTypes] = useState<Array<{ id: number; devoir_type: string }>>([]);
  const [shouldRestoreForm, setShouldRestoreForm] = useState(false);

  // Auto-open the correct dialog when restoreForm is in URL.
  // Accepts: ?restoreForm=true (legacy, picks based on session formType),
  //          ?restoreForm=resource, or ?restoreForm=question.
  useEffect(() => {
    const flag = searchParams.get('restoreForm');
    if (!flag) return;

    let target: 'resource' | 'question' = 'resource';
    if (flag === 'question') {
      target = 'question';
    } else if (flag === 'resource') {
      target = 'resource';
    } else {
      // legacy 'true' — infer from active session
      const formType = getActivePendingFormType();
      target = formType === 'askQuestionGlobal' ? 'question' : 'resource';
    }

    setShouldRestoreForm(true);
    if (target === 'question') {
      setIsAskDialogOpen(true);
    } else {
      setIsAddResourceDialogOpen(true);
    }
    searchParams.delete('restoreForm');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Reset restore flag when both dialogs are closed
  useEffect(() => {
    if (!isAddResourceDialogOpen && !isAskDialogOpen) {
      setShouldRestoreForm(false);
    }
  }, [isAddResourceDialogOpen, isAskDialogOpen]);

  useEffect(() => {
    fetchTypes();
  }, []);

  const fetchTypes = async () => {
    const { data: types } = await supabase
      .from('resource_types')
      .select('*')
      .order('id');
    
    const { data: dTypes } = await supabase
      .from('devoir_types')
      .select('*')
      .order('id');

    setResourceTypes(types || []);
    setDevoirTypes(dTypes || []);
  };

  return (
    <>
      <section className="flex w-full flex-col overflow-hidden items-stretch text-xs text-white font-medium tracking-[0.2px] leading-[1.6] justify-center mt-4 px-4">
        <div className="flex min-h-10 w-full items-center gap-2 overflow-hidden justify-center flex-wrap sm:flex-nowrap">
          <button
            className="justify-center items-center flex gap-0.5 whitespace-nowrap bg-[#38A6FF] px-2.5 py-2 rounded-lg hover:bg-[#2B8FE8] transition-colors flex-1 sm:flex-none"
            onClick={() => setIsAskDialogOpen(true)}
            aria-label="Ask a question"
          >
            <MessageCircle className="w-6 h-6" />
            <span className="text-white">
              Ask
            </span>
          </button>
          <div className="flex-1 sm:flex-none">
            <MemorizeButton />
          </div>
          <button
            className="justify-center items-center flex gap-0.5 bg-[#F6A18A] px-2.5 py-2 rounded-lg hover:bg-[#F4927A] transition-colors flex-1 sm:flex-none"
            onClick={() => setIsAddResourceDialogOpen(true)}
            aria-label="Add learning resource"
          >
            <Plus className="w-6 h-6" />
            <span className="text-white">
              Add Resource
            </span>
          </button>
        </div>
      </section>

      <Dialog open={isAskDialogOpen} onOpenChange={setIsAskDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ask a Question</DialogTitle>
          </DialogHeader>
          <AskQuestionGlobalForm
            resourceTypes={resourceTypes}
            onSuccess={() => setIsAskDialogOpen(false)}
            onCancel={() => setIsAskDialogOpen(false)}
            restoreSession={shouldRestoreForm}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isAddResourceDialogOpen} onOpenChange={setIsAddResourceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a Resource</DialogTitle>
          </DialogHeader>
          <AddResourceGlobalForm
            resourceTypes={resourceTypes}
            devoirTypes={devoirTypes}
            onSuccess={() => setIsAddResourceDialogOpen(false)}
            onCancel={() => setIsAddResourceDialogOpen(false)}
            restoreSession={shouldRestoreForm}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
