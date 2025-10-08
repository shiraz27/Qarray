import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { MessageSquare, BookmarkPlus, FileText, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface Notification {
  id: string;
  type: 'answer_added' | 'bookmark_content' | 'new_resource';
  title: string;
  message: string;
  reference_id: number | null;
  reference_type: string | null;
  read: boolean;
  created_at: string;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications((data || []) as Notification[]);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Failed to mark notifications as read');
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    await markAsRead(notification.id);
    
    if (notification.reference_type === 'question' && notification.reference_id) {
      navigate(`/question/${notification.reference_id}`);
    } else if (notification.reference_type === 'resource' && notification.reference_id) {
      navigate(`/resource/${notification.reference_id}`);
    }
    
    onClose();
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'answer_added':
        return <MessageSquare className="w-5 h-5 text-primary" />;
      case 'bookmark_content':
        return <BookmarkPlus className="w-5 h-5 text-accent" />;
      case 'new_resource':
        return <FileText className="w-5 h-5 text-secondary" />;
      default:
        return <MessageSquare className="w-5 h-5" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'answer_added':
        return 'border-l-4 border-l-primary bg-primary/5';
      case 'bookmark_content':
        return 'border-l-4 border-l-accent bg-accent/5';
      case 'new_resource':
        return 'border-l-4 border-l-secondary bg-secondary/5';
      default:
        return 'border-l-4 border-l-muted';
    }
  };

  const groupedNotifications = notifications.reduce((acc, notification) => {
    if (!acc[notification.type]) {
      acc[notification.type] = [];
    }
    acc[notification.type].push(notification);
    return acc;
  }, {} as Record<string, Notification[]>);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Notifications {unreadCount > 0 && `(${unreadCount})`}</SheetTitle>
            {unreadCount > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={markAllAsRead}
                className="text-xs"
              >
                <Check className="w-4 h-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedNotifications).map(([type, notifs]) => (
                <div key={type} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-2">
                    {type === 'answer_added' && 'Answers'}
                    {type === 'bookmark_content' && 'Bookmarked Chapters'}
                    {type === 'new_resource' && 'New Resources'}
                  </h3>
                  <div className="space-y-2">
                    {notifs.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full text-left p-3 rounded-lg transition-all hover:shadow-md ${
                          getNotificationColor(notification.type)
                        } ${!notification.read ? 'font-medium' : 'opacity-70'}`}
                      >
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 mt-1">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-sm">{notification.title}</p>
                              {!notification.read && (
                                <span className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-1.5" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};