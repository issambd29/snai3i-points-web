import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Snai3iIcon } from './Snai3iIcon';
import { Send, X, BookOpen, Shield, User, ChevronDown, Trash2 } from 'lucide-react';
import { formatDateTime } from '../utils/date';

export const ChatPanel = ({ classroomId, isOpen, onClose, availableClassrooms }) => {
  const { state, currentUser, sendMessage, deleteMessage, refreshMessages, triggerToast } = useApp();
  const [inputText, setInputText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Compute available classrooms for selection (for teacher or admin)
  const selectableClassrooms = useMemo(() => {
    if (availableClassrooms && availableClassrooms.length > 0) {
      return availableClassrooms;
    }
    return state.classrooms || [];
  }, [availableClassrooms, state.classrooms]);

  // Selected classroom state
  const [selectedClassId, setSelectedClassId] = useState(
    classroomId || selectableClassrooms[0]?.id || ''
  );

  // Sync selectedClassId if prop changes
  useEffect(() => {
    if (classroomId) {
      setSelectedClassId(classroomId);
    } else if (selectableClassrooms.length > 0 && !selectableClassrooms.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(selectableClassrooms[0].id);
    }
  }, [classroomId, selectableClassrooms]);

  const activeClassroom =
    selectableClassrooms.find((c) => c.id === selectedClassId) ||
    state.classrooms?.find((c) => c.id === selectedClassId) ||
    state.classrooms?.[0];

  // Filter messages for active classroom
  const classroomMessages = useMemo(() => {
    const list = state.messages || state.chatMessages || [];
    if (!activeClassroom?.id) return list;
    return list.filter((m) => {
      const msgClassId = String(m.classroomId || '');
      const targetClassId = String(activeClassroom.id);
      return msgClassId === targetClassId || msgClassId.replace('c-', '') === targetClassId.replace('c-', '');
    });
  }, [state.messages, state.chatMessages, activeClassroom]);

  // Auto-scroll to bottom
  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom('auto');
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, selectedClassId]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom('smooth');
    }
  }, [classroomMessages.length]);

  // Real-time polling when panel is open
  useEffect(() => {
    if (!isOpen || !activeClassroom?.id) return;

    // Immediately fetch latest messages
    if (typeof refreshMessages === 'function') {
      refreshMessages(activeClassroom.id);
    }

    // Poll every 2.5 seconds for instant multi-member conversation
    const interval = setInterval(() => {
      if (typeof refreshMessages === 'function') {
        refreshMessages(activeClassroom.id);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isOpen, activeClassroom?.id, refreshMessages]);

  if (!isOpen) return null;

  const handleSend = async (e) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    // Clear the box at once and keep typing: the message shows instantly and is saved in the background.
    setInputText('');
    inputRef.current?.focus();
    const targetClassId = activeClassroom?.id || selectedClassId;
    setTimeout(() => scrollToBottom('smooth'), 30);

    const res = await sendMessage(targetClassId, text);
    if (!res.success) {
      triggerToast('Message not sent', res.error, 'danger');
      setInputText((current) => current || text);
    }
  };

  const handleDelete = async (msg) => {
    setConfirmDeleteId(null);
    const res = await deleteMessage(msg.id);
    if (res.success) triggerToast('Message Deleted', 'The message was removed.');
    else triggerToast('Could not delete message', res.error, 'danger');
  };

  const formatMessageTime = (msg) => formatDateTime(msg.timestamp);

  return (
    <div
      id="snai3i-chat-panel"
      className="fixed bottom-24 right-4 sm:right-6 w-[min(400px,calc(100vw-32px))] bg-white rounded-2xl shadow-2xl border border-[#e5e7eb] z-[1200] overflow-hidden flex flex-col h-[520px] max-h-[calc(100vh-120px)] animate-in fade-in slide-in-from-bottom-4 duration-200"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-[#1F1F38] text-white flex items-center justify-between shadow-xs border-b border-[#2d2d4e]">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          <div className="w-8 h-8 rounded-xl bg-[#F2A807] flex items-center justify-center p-1.5 shadow-xs shrink-0">
            <Snai3iIcon className="w-full h-full" fill="#ffffff" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-xs sm:text-sm text-white truncate">
                {activeClassroom?.name || 'Class Discussion'}
              </h3>
            </div>
            <p className="text-[10px] text-gray-300 flex items-center gap-1 font-medium mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Class Discussion ({classroomMessages.length} msgs)
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
          title="Close chat"
          aria-label="Close chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Classroom selector switcher (if teacher or admin has multiple classrooms) */}
      {selectableClassrooms.length > 1 && (
        <div className="px-3 py-1.5 bg-[#f8fafc] border-b border-gray-200 flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider shrink-0">
            Classroom:
          </span>
          <div className="relative flex-1">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full text-xs font-semibold bg-white border border-gray-200 rounded-lg px-2.5 py-1 pr-6 text-[#1F1F38] appearance-none focus:outline-none focus:border-[#F2A807] cursor-pointer"
            >
              {selectableClassrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.specialty ? `(${c.specialty})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Messages stream */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#fdfbf7]">
        {classroomMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center p-2 mb-2 shadow-2xs">
              <Snai3iIcon className="w-full h-full opacity-70" fill="#F2A807" />
            </div>
            <p className="text-xs font-bold text-gray-800">No messages in this class yet</p>
            <p className="text-[11px] text-gray-500 mt-1 max-w-[240px]">
              Say hello or ask questions to start the discussion with your teacher and classmates!
            </p>
          </div>
        ) : (
          classroomMessages.map((msg) => {
            const isMe = msg.senderId === currentUser?.id;

            const role = (msg.senderRole || '').toLowerCase();
            const isTeacher = role === 'teacher';
            const isAdmin = role === 'admin';
            const isManager = role === 'manager';

            const messageText = msg.body || msg.text || msg.content || '';
            const isPending = Boolean(msg.pending) || String(msg.id).startsWith('temp-');
            const canDelete = !isPending && (isMe || ['admin', 'manager', 'teacher'].includes(currentUser?.role));
            const initials = (msg.senderName || 'U').trim().substring(0, 2).toUpperCase();

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {/* Header info (Sender name + Role badge + Time) */}
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  {!isMe && (
                    <div className="w-4 h-4 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[9px] font-bold">
                      {initials[0]}
                    </div>
                  )}

                  <span className="text-[11px] font-bold text-gray-700">
                    {isMe ? 'You' : msg.senderName}
                  </span>

                  {isTeacher && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 text-[9px] font-extrabold border border-amber-200">
                      <BookOpen className="w-2.5 h-2.5" /> Teacher
                    </span>
                  )}

                  {isAdmin && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-900 text-[9px] font-extrabold border border-indigo-200">
                      <Shield className="w-2.5 h-2.5" /> Admin
                    </span>
                  )}

                  {isManager && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-900 text-[9px] font-extrabold border border-indigo-200">
                      <Shield className="w-2.5 h-2.5" /> Manager
                    </span>
                  )}

                  {!isTeacher && !isAdmin && !isManager && !isMe && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600 text-[9px] font-semibold border border-gray-200">
                      <User className="w-2.5 h-2.5" /> Student
                    </span>
                  )}

                  <span className="text-[9px] text-gray-400 font-medium">
                    {formatMessageTime(msg)}
                  </span>
                </div>

                {/* Message bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs font-medium leading-relaxed break-words shadow-2xs ${
                    isMe
                      ? 'bg-[#F2A807] text-white rounded-tr-xs'
                      : 'bg-white border border-[#e8dfc8] text-[#1F1F38] rounded-tl-xs'
                  }`}
                >
                  {messageText}
                </div>

                {isPending && <span className="text-[9px] text-gray-400 mt-0.5 px-1">Sending…</span>}

                {canDelete && (
                  <div className="mt-0.5 px-1">
                    {confirmDeleteId === msg.id ? (
                      <span className="inline-flex items-center gap-2 text-[10px] font-semibold">
                        <span className="text-gray-500">Delete this message?</span>
                        <button type="button" onClick={() => handleDelete(msg)} className="text-red-600 hover:underline cursor-pointer">Delete</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-gray-500 hover:underline cursor-pointer">Cancel</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(msg.id)}
                        className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-600 transition cursor-pointer"
                        title="Delete message"
                        aria-label="Delete message"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <form onSubmit={handleSend} className="p-2.5 bg-white border-t border-gray-200 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Message ${activeClassroom?.name || 'class'}...`}
          className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#F2A807] focus:ring-2 focus:ring-[#F2A807]/20 transition text-[#1F1F38]"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="px-3.5 py-2 rounded-xl bg-[#F2A807] hover:bg-[#d99206] disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer shadow-xs"
          title="Send message"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">Send</span>
        </button>
      </form>
    </div>
  );
};
