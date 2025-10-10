import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting flashcard review check...');

    // Get all flashcard reviews that are due (next_review_date <= now)
    const { data: dueReviews, error: reviewsError } = await supabase
      .from('flashcard_reviews')
      .select('user_id, memorization_id, flashcard_id, next_review_date')
      .lte('next_review_date', new Date().toISOString());

    if (reviewsError) {
      console.error('Error fetching due reviews:', reviewsError);
      throw reviewsError;
    }

    console.log(`Found ${dueReviews?.length || 0} due flashcard reviews`);

    if (!dueReviews || dueReviews.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No due flashcards found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Group by user_id and count due flashcards
    const userFlashcardCounts = dueReviews.reduce((acc, review) => {
      if (!acc[review.user_id]) {
        acc[review.user_id] = {
          count: 0,
          memorizations: new Set()
        };
      }
      acc[review.user_id].count++;
      acc[review.user_id].memorizations.add(review.memorization_id);
      return acc;
    }, {} as Record<string, { count: number; memorizations: Set<number> }>);

    console.log(`Processing notifications for ${Object.keys(userFlashcardCounts).length} users`);

    // Create notifications for each user
    const notifications = Object.entries(userFlashcardCounts).map(([userId, data]) => ({
      user_id: userId,
      type: 'flashcard_review',
      title: 'Flashcards Due for Review',
      message: `You have ${data.count} flashcard${data.count > 1 ? 's' : ''} due for review across ${data.memorizations.size} memorization${data.memorizations.size > 1 ? 's' : ''}`,
      reference_type: 'flashcard',
      reference_id: null
    }));

    // Check for existing unread notifications for each user today
    const { data: existingNotifications } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('type', 'flashcard_review')
      .eq('read', false)
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

    const existingUserIds = new Set(existingNotifications?.map(n => n.user_id) || []);

    // Filter out users who already have unread flashcard review notifications today
    const newNotifications = notifications.filter(n => !existingUserIds.has(n.user_id));

    if (newNotifications.length > 0) {
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert(newNotifications);

      if (notificationError) {
        console.error('Error creating notifications:', notificationError);
        throw notificationError;
      }

      console.log(`Created ${newNotifications.length} new notifications`);
    } else {
      console.log('All users already have unread notifications today');
    }

    return new Response(
      JSON.stringify({
        message: 'Flashcard review check completed',
        dueFlashcards: dueReviews.length,
        notificationsCreated: newNotifications.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in check-flashcard-reviews:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
