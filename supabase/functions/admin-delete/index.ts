import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Whitelist of tables that can be deleted from
const ALLOWED_TABLES = [
  'memorizations',
  'flashcards',
  'flashcard_reviews',
  'memorization_subscriptions',
  'questions',
  'answers',
  'resources',
  'bookmarks',
  'votes',
  'notifications',
] as const;

type AllowedTable = typeof ALLOWED_TABLES[number];

// Define cascade relationships
const CASCADE_MAP: Record<string, { table: string; column: string; parentColumn?: string }[]> = {
  memorizations: [
    { table: 'flashcard_reviews', column: 'memorization_id' },
    { table: 'memorization_subscriptions', column: 'memorization_id' },
    { table: 'flashcards', column: 'memorization_id' },
    { table: 'bookmarks', column: 'content_id', parentColumn: 'content_type' },
    { table: 'votes', column: 'content_id', parentColumn: 'content_type' },
  ],
  questions: [
    { table: 'answers', column: 'question_id' },
    { table: 'bookmarks', column: 'content_id', parentColumn: 'content_type' },
    { table: 'votes', column: 'content_id', parentColumn: 'content_type' },
  ],
  answers: [
    { table: 'bookmarks', column: 'content_id', parentColumn: 'content_type' },
    { table: 'votes', column: 'content_id', parentColumn: 'content_type' },
  ],
  resources: [
    { table: 'bookmarks', column: 'content_id', parentColumn: 'content_type' },
    { table: 'votes', column: 'content_id', parentColumn: 'content_type' },
  ],
  flashcards: [
    { table: 'flashcard_reviews', column: 'flashcard_id' },
  ],
};

// Content type mapping for polymorphic relations
const CONTENT_TYPE_MAP: Record<string, string> = {
  memorizations: 'memorization',
  questions: 'question',
  answers: 'answer',
  resources: 'resource',
};

interface DeleteRequest {
  table: string;
  ids?: number[];
  deleteAll?: boolean;
  hardDelete?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify identity
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client to check roles and perform deletions
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if user is admin or moderator
    const { data: roleCheck, error: roleError } = await supabaseAdmin.rpc(
      'is_moderator_or_admin',
      { _user_id: user.id }
    );

    if (roleError) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!roleCheck) {
      console.log(`User ${user.id} attempted admin-delete without permission`);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin or moderator role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: DeleteRequest = await req.json();
    const { table, ids, deleteAll, hardDelete = true } = body;

    // Validate table name
    if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid table. Allowed tables: ${ALLOWED_TABLES.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Require either ids or deleteAll
    if (!ids?.length && !deleteAll) {
      return new Response(
        JSON.stringify({ error: 'Must provide ids array or set deleteAll to true' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin delete request by ${user.id}: table=${table}, ids=${ids?.join(',') || 'ALL'}, hardDelete=${hardDelete}`);

    const cascadeResults: string[] = [];
    let deletedCount = 0;

    // Get IDs to delete if deleteAll
    let targetIds = ids;
    if (deleteAll && !ids?.length) {
      const { data: allRows, error: fetchError } = await supabaseAdmin
        .from(table)
        .select('id');
      
      if (fetchError) {
        console.error('Error fetching rows:', fetchError);
        return new Response(
          JSON.stringify({ error: `Failed to fetch rows: ${fetchError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      targetIds = allRows?.map(r => r.id) || [];
    }

    if (!targetIds?.length) {
      return new Response(
        JSON.stringify({ success: true, deleted: 0, table, cascade: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle cascade deletions
    const cascades = CASCADE_MAP[table] || [];
    for (const cascade of cascades) {
      let query = supabaseAdmin.from(cascade.table).delete();
      
      // Handle polymorphic relations (bookmarks, votes)
      if (cascade.parentColumn && CONTENT_TYPE_MAP[table]) {
        query = query
          .eq(cascade.parentColumn, CONTENT_TYPE_MAP[table])
          .in(cascade.column, targetIds);
      } else {
        query = query.in(cascade.column, targetIds);
      }

      const { error: cascadeError, count } = await query.select('id');
      
      if (cascadeError) {
        console.error(`Cascade delete error for ${cascade.table}:`, cascadeError);
        // Continue with other cascades
      } else {
        cascadeResults.push(`${cascade.table}: ${count || 0} rows`);
        console.log(`Cascade deleted from ${cascade.table}: ${count || 0} rows`);
      }
    }

    // Perform main deletion
    if (hardDelete) {
      const { error: deleteError, count } = await supabaseAdmin
        .from(table)
        .delete()
        .in('id', targetIds)
        .select('id');

      if (deleteError) {
        console.error('Delete error:', deleteError);
        return new Response(
          JSON.stringify({ error: `Failed to delete: ${deleteError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      deletedCount = count || 0;
    } else {
      // Soft delete - set deleted = true
      const { error: updateError, count } = await supabaseAdmin
        .from(table)
        .update({ deleted: true })
        .in('id', targetIds)
        .select('id');

      if (updateError) {
        console.error('Soft delete error:', updateError);
        return new Response(
          JSON.stringify({ error: `Failed to soft delete: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      deletedCount = count || 0;
    }

    console.log(`Successfully deleted ${deletedCount} rows from ${table}`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted: deletedCount,
        table,
        cascade: cascadeResults,
        hardDelete,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
