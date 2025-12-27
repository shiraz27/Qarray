-- Update the trigger function to be more robust with error handling
CREATE OR REPLACE FUNCTION public.delete_bookmarks_on_content_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when deleted changes from false to true
  IF NEW.deleted = true AND OLD.deleted = false THEN
    BEGIN
      DELETE FROM public.bookmarks 
      WHERE content_id = NEW.id 
      AND content_type = TG_ARGV[0];
    EXCEPTION WHEN OTHERS THEN
      -- Log but don't fail the main operation
      RAISE WARNING 'Failed to delete bookmarks for % %: %', TG_ARGV[0], NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;