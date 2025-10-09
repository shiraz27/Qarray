import { Textarea } from '@/components/ui/textarea';
import { MediaUploader } from './MediaUploader';

interface FlashcardEditorProps {
  data: {
    text: string;
    media?: string[];
  };
  onChange: (data: { text: string; media: string[] }) => void;
  placeholder?: string;
}

export const FlashcardEditor = ({ data, onChange, placeholder }: FlashcardEditorProps) => {
  const handleTextChange = (text: string) => {
    onChange({ ...data, text, media: data.media || [] });
  };

  const handleMediaUploaded = (url: string, type: string) => {
    const updatedMedia = [...(data.media || []), url];
    onChange({ ...data, media: updatedMedia });
  };

  const handleRemoveMedia = (index: number) => {
    const updatedMedia = (data.media || []).filter((_, i) => i !== index);
    onChange({ ...data, media: updatedMedia });
  };

  return (
    <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
      <Textarea
        value={data.text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="resize-none"
      />
      <MediaUploader
        onMediaUploaded={handleMediaUploaded}
        uploadedMedia={(data.media || []).map(url => ({ url, type: 'image', name: url }))}
        onRemoveMedia={handleRemoveMedia}
      />
    </div>
  );
};
