-- Grant execute permission on the is_moderator_or_admin function to authenticated users
GRANT EXECUTE ON FUNCTION public.is_moderator_or_admin(uuid) TO authenticated;

-- Grant execute permission on the has_role function as well
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;