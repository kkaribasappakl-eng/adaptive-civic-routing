import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  Check,
  X,
  FileCheck,
  Sparkles,
  Compass,
  AlertTriangle,
  Activity,
  Clock,
  AlertOctagon,
  Award,
  Lock,
  RefreshCw,
  Filter
} from 'lucide-react';
import {
  getAllNotifications,
  getGlobalUnreadNotifications,
  markNotificationRead,
  markAllGlobalNotificationsRead
} from '../services/api';
import socket from '../services/socket';

const NOTIFICATION_ICONS = {
  COMPLAINT_SUBMITTED: { icon: FileCheck, color: 'text-blue-400', bg: 'bg-blue-950/40 border-blue-800/40' },
  CATEGORY_UPDATED: { icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-950/40 border-purple-800/40' },
  ROUTING_COMPLETED: { icon: Compass, color: 'text-emerald-400', bg: 'bg-emerald-950/40 border-emerald-800/40' },
  HUMAN_REVIEW_REQUIRED: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-950/40 border-amber-800/40' },
  STATUS_CHANGED: { icon: Activity, color: 'text-cyan-400', bg: 'bg-cyan-950/40 border-cyan-800/40' },
  SLA_WARNING: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-950/40 border-amber-800/40' },
  SLA_BREACHED: { icon: AlertOctagon, color: 'text-rose-400', bg: 'bg-rose-950/40 border-rose-800/40' },
  CASE_RESOLVED: { icon: Award, color: 'text-emerald-400', bg: 'bg-emerald-950/40 border-emerald-800/40' },
  CASE_CLOSED: { icon: Lock, color: 'text-slate-400', bg: 'bg-slate-900 border-slate-700' }
};

export default function NotificationCenter({ onSelectComplaint }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'UNREAD'
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Load notifications and initial unread count
  const loadNotifications = async () => {
    setLoading(true);
    const [allRes, unreadRes] = await Promise.all([
      getAllNotifications(50, 0, filter === 'UNREAD' ? false : null),
      getGlobalUnreadNotifications(100, 0)
    ]);

    if (allRes.success && allRes.data) {
      setNotifications(allRes.data);
    }
    if (unreadRes.success && typeof unreadRes.count === 'number') {
      setUnreadCount(unreadRes.count);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadNotifications();
  }, [filter]);

  // Real-time Socket.IO listener for notification:created
  useEffect(() => {
    const handleNotificationCreated = (payload) => {
      // Prepend newly created real notification
      setNotifications((prev) => {
        if (prev.some((n) => n.id === payload.notificationId)) return prev;
        const newNotif = {
          id: payload.notificationId,
          complaint_id: payload.complaintId,
          complaint_code: payload.complaintCode,
          notification_type: payload.notificationType,
          title: payload.title,
          message: payload.message,
          is_read: false,
          created_at: payload.createdAt
        };
        return [newNotif, ...prev];
      });
      setUnreadCount((prev) => prev + 1);
    };

    socket.on('notification:created', handleNotificationCreated);
    return () => {
      socket.off('notification:created', handleNotificationCreated);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkOneRead = async (e, notificationId) => {
    e.stopPropagation();
    const res = await markNotificationRead(notificationId);
    if (res.success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const handleMarkAllRead = async () => {
    setActionLoading(true);
    const res = await markAllGlobalNotificationsRead();
    if (res.success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
    setActionLoading(false);
  };

  const formatTimestamp = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · ' + date.toLocaleDateString();
    } catch (e) {
      return dateStr;
    }
  };

  const displayedList = filter === 'UNREAD' 
    ? notifications.filter((n) => !n.is_read) 
    : notifications;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        id="notification-center-trigger"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-emerald-500"
        title="Citizen Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span 
            id="unread-notifications-badge"
            className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-[18px] text-[10px] font-bold leading-none text-white bg-rose-600 rounded-full border border-slate-950 animate-pulse flex items-center justify-center"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Floating Notifications Drawer / Modal */}
      {isOpen && (
        <div 
          id="notification-center-dropdown"
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[550px]"
        >
          {/* Header */}
          <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Citizen Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  id="mark-all-notifications-read-btn"
                  onClick={handleMarkAllRead}
                  disabled={actionLoading}
                  className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-0.5 rounded hover:bg-slate-800 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-3 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFilter('ALL')}
                className={`px-2 py-0.5 rounded transition ${
                  filter === 'ALL'
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('UNREAD')}
                className={`px-2 py-0.5 rounded transition ${
                  filter === 'UNREAD'
                    ? 'bg-slate-800 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            <button
              onClick={loadNotifications}
              className="text-slate-500 hover:text-slate-300 transition"
              title="Refresh notifications"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-800/60">
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono">
                Loading notifications...
              </div>
            ) : displayedList.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Bell className="w-8 h-8 text-slate-700 mx-auto" />
                <p className="text-xs text-slate-400 font-medium">No notifications yet.</p>
                <p className="text-[11px] text-slate-600 font-mono">
                  Live updates will appear as cases are intake, routed, and resolved.
                </p>
              </div>
            ) : (
              displayedList.map((notif) => {
                const typeConfig = NOTIFICATION_ICONS[notif.notification_type] || {
                  icon: Bell,
                  color: 'text-slate-400',
                  bg: 'bg-slate-900 border-slate-800'
                };
                const IconComponent = typeConfig.icon;

                return (
                  <div
                    key={notif.id}
                    onClick={() => onSelectComplaint && onSelectComplaint(notif.complaint_id)}
                    className={`p-3 transition cursor-pointer hover:bg-slate-800/40 flex items-start gap-3 ${
                      !notif.is_read ? 'bg-slate-800/20' : 'opacity-80'
                    }`}
                  >
                    {/* Icon */}
                    <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${typeConfig.bg} ${typeConfig.color}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-white truncate">
                          {notif.title}
                        </span>
                        {!notif.is_read && (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" title="Unread" />
                        )}
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed break-words">
                        {notif.message}
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-slate-500">
                        <span className="text-cyan-400 font-medium">
                          {notif.complaint_code || 'Complaint'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span>{formatTimestamp(notif.created_at)}</span>
                          {!notif.is_read && (
                            <button
                              onClick={(e) => handleMarkOneRead(e, notif.id)}
                              className="text-slate-400 hover:text-emerald-400 transition"
                              title="Mark as read"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
