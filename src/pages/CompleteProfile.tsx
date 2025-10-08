import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import qarayLogo from '@/assets/qarray-logo-new.png';

interface State {
  id: number;
  name: string;
}

interface Institute {
  id: string;
  name: string;
  state_id: number;
}

const CompleteProfile: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [stateId, setStateId] = useState('');
  const [classId, setClassId] = useState('');
  const [instituteId, setInstituteId] = useState('');
  const [states, setStates] = useState<State[]>([]);
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loadingStates, setLoadingStates] = useState(true);
  const [loadingInstitutes, setLoadingInstitutes] = useState(false);
  const [openInstitute, setOpenInstitute] = useState(false);

  // Fetch states on component mount
  useEffect(() => {
    const fetchStates = async () => {
      try {
        const { data, error } = await supabase
          .from('states')
          .select('id, name')
          .order('name');

        if (error) throw error;
        setStates(data || []);
      } catch (error: any) {
        toast({
          title: t('error'),
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoadingStates(false);
      }
    };

    fetchStates();
  }, [toast, t]);

  // Fetch institutes when state changes
  useEffect(() => {
    if (!stateId) {
      setInstitutes([]);
      setInstituteId('');
      return;
    }

    const fetchInstitutes = async () => {
      setLoadingInstitutes(true);
      try {
        const { data, error } = await supabase
          .from('institutes')
          .select('id, name, state_id')
          .eq('state_id', parseInt(stateId))
          .order('name');

        if (error) throw error;
        setInstitutes(data || []);
        
        // Reset institute selection when state changes
        setInstituteId('');
      } catch (error: any) {
        toast({
          title: t('error'),
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoadingInstitutes(false);
      }
    };

    fetchInstitutes();
  }, [stateId, toast, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          phone_number: `+216${phoneNumber}`,
          state_id: parseInt(stateId),
          class_id: parseInt(classId),
          institute_id: instituteId,
          full_name: user.user_metadata.full_name || user.email?.split('@')[0] || 'User',
        });

      if (error) throw error;

      toast({
        title: t('success'),
        description: t('profileCompleted'),
      });
      navigate('/');
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="mb-6 bg-white rounded-3xl p-8 shadow-sm">
          <img
            src={qarayLogo}
            alt="Qarray Logo"
            className="w-32 h-32 object-contain"
          />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-gray-800">Qarray</h2>

        <h1 className="text-2xl font-bold mb-2 mt-6">
          {t('completeProfile')}
        </h1>
        <p className="text-gray-600 mb-8 text-center max-w-md">
          {t('completeProfileSubtitle')}
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <Label htmlFor="phone">{t('phoneNumber')}</Label>
            <div className="flex gap-2">
              <div className="w-24">
                <Input
                  value="+216"
                  disabled
                  className="h-12 text-base bg-gray-50"
                />
              </div>
              <Input
                id="phone"
                type="tel"
                placeholder="XX XXX XXX"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={8}
                className="h-12 text-base flex-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="state">{t('gouvernorat')}</Label>
            <Select value={stateId} onValueChange={setStateId} required disabled={loadingStates}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder={loadingStates ? t('loading') : t('selectGouvernorat')} />
              </SelectTrigger>
              <SelectContent>
                {states.map((state) => (
                  <SelectItem key={state.id} value={state.id.toString()}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="class">{t('classe')}</Label>
            <Select value={classId} onValueChange={setClassId} required>
              <SelectTrigger className="h-12">
                <SelectValue placeholder={t('selectClasse')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">7ème année</SelectItem>
                <SelectItem value="2">8ème année</SelectItem>
                <SelectItem value="3">9ème année</SelectItem>
                <SelectItem value="4">1ère année</SelectItem>
                <SelectItem value="5">2ème année</SelectItem>
                <SelectItem value="6">3ème année</SelectItem>
                <SelectItem value="7">Bac</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="institute">{t('lycee')}</Label>
            <Popover open={openInstitute} onOpenChange={setOpenInstitute}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openInstitute}
                  disabled={!stateId || loadingInstitutes}
                  className={cn(
                    "w-full h-12 justify-between",
                    !instituteId && "text-muted-foreground"
                  )}
                >
                  {instituteId
                    ? institutes.find((institute) => institute.id === instituteId)?.name
                    : !stateId 
                    ? t('selectGouvernoratFirst')
                    : loadingInstitutes
                    ? t('loading')
                    : t('selectLycee')}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder={t('searchInstitute')} />
                  <CommandList>
                    <CommandEmpty>
                      {institutes.length === 0 && !loadingInstitutes 
                        ? t('noInstitutesFound')
                        : t('noResults')}
                    </CommandEmpty>
                    <CommandGroup>
                      {institutes.map((institute) => (
                        <CommandItem
                          key={institute.id}
                          value={institute.name}
                          onSelect={() => {
                            setInstituteId(institute.id);
                            setOpenInstitute(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              instituteId === institute.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {institute.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <Button 
            type="submit"
            disabled={loading || !phoneNumber || !stateId || !classId}
            className="w-full h-12 bg-[#38A6FF] hover:bg-[#2B8FE8] text-white text-base font-medium rounded-lg mt-6"
          >
            {loading ? t('loading') : t('complete')}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CompleteProfile;
