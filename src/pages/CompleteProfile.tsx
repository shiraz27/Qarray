import React, { useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import qarayLogo from '@/assets/qarray-logo-new.png';

const CompleteProfile: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [stateId, setStateId] = useState('');
  const [classId, setClassId] = useState('');
  const [instituteId, setInstituteId] = useState('');

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
            <Select value={stateId} onValueChange={setStateId} required>
              <SelectTrigger className="h-12">
                <SelectValue placeholder={t('selectGouvernorat')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Tunis</SelectItem>
                <SelectItem value="2">Ariana</SelectItem>
                <SelectItem value="3">Ben Arous</SelectItem>
                <SelectItem value="4">Manouba</SelectItem>
                <SelectItem value="5">Nabeul</SelectItem>
                <SelectItem value="6">Zaghouan</SelectItem>
                <SelectItem value="7">Bizerte</SelectItem>
                <SelectItem value="8">Béja</SelectItem>
                <SelectItem value="9">Jendouba</SelectItem>
                <SelectItem value="10">Kef</SelectItem>
                <SelectItem value="11">Siliana</SelectItem>
                <SelectItem value="12">Sousse</SelectItem>
                <SelectItem value="13">Monastir</SelectItem>
                <SelectItem value="14">Mahdia</SelectItem>
                <SelectItem value="15">Sfax</SelectItem>
                <SelectItem value="16">Kairouan</SelectItem>
                <SelectItem value="17">Kasserine</SelectItem>
                <SelectItem value="18">Sidi Bouzid</SelectItem>
                <SelectItem value="19">Gabès</SelectItem>
                <SelectItem value="20">Médenine</SelectItem>
                <SelectItem value="21">Tataouine</SelectItem>
                <SelectItem value="22">Gafsa</SelectItem>
                <SelectItem value="23">Tozeur</SelectItem>
                <SelectItem value="24">Kebili</SelectItem>
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
            <Select value={instituteId} onValueChange={setInstituteId}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder={t('selectLycee')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="placeholder">-- {t('selectLycee')} --</SelectItem>
              </SelectContent>
            </Select>
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
