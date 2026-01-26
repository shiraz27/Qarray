import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AskQuestionGlobalForm } from './AskQuestionGlobalForm';
import { AddResourceGlobalForm } from './AddResourceGlobalForm';
import { supabase } from '@/integrations/supabase/client';
import { MemorizeButton } from './MemorizeButton';

export const ActionButtons: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAskDialogOpen, setIsAskDialogOpen] = useState(false);
  const [isAddResourceDialogOpen, setIsAddResourceDialogOpen] = useState(false);
  const [resourceTypes, setResourceTypes] = useState<Array<{ id: number; type: string }>>([]);
  const [devoirTypes, setDevoirTypes] = useState<Array<{ id: number; devoir_type: string }>>([]);
  const [shouldRestoreForm, setShouldRestoreForm] = useState(false);

  // Auto-open dialog when restoreForm=true is in URL
  useEffect(() => {
    if (searchParams.get('restoreForm') === 'true') {
      setShouldRestoreForm(true);
      setIsAddResourceDialogOpen(true);
      // Clear the query param
      searchParams.delete('restoreForm');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Reset restore flag when dialog closes
  useEffect(() => {
    if (!isAddResourceDialogOpen) {
      setShouldRestoreForm(false);
    }
  }, [isAddResourceDialogOpen]);

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
