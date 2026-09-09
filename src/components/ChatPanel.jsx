import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Snai3iIcon } from './Snai3iIcon';
import { Send, X, BookOpen, MessageSquare } from 'lucide-react';

export const ChatPanel = ({ classroomId, isOpen, onClose }) => {
  const { state, currentUser, sendMessage } = useApp();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const classroom = state.classrooms.find((c) => c.id === classroomId) || state.classrooms[0];
  const classroomMessages = state.messages.filter((m) => m.classroomId === classroom?.id);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [classroomMessages.length, isOpen]);

  if (!isOpen) return null;

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendMessage(classroom?.id || 'c-1', inputText);
    setInputText('');
  };

  return (
    <div className="fixed bottom-24 right-4 sm:right-6 w-[min(380px,calc(100vw-32px))] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden flex flex-col h-[480px] animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Header with Snai3i Brand Icon */}
      <div className="px-4 py-3 bg-[#1F1F38] text-white flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#F2A807] flex items-center justify-center p-1.5 shadow-xs">
            <Snai3iIcon className="w-full h-full" fill="#ffffff" />
          </div>
          <div>
            <h3 className="font-extrabold text-xs sm:text-sm text-white truncate max-w-[200px]">
              {classroom?.name || 'Classroom Chat'}
            </h3>
            <p className="text-[10px] text-gray-300 flex items-center gap-1 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Discussion
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages stream */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-[#fbfbfd]">
        {classroomMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center p-2 mb-2">
              <Snai3iIcon className="w-full h-full opacity-60" fill="#F2A807" />
            </div>
            <p className="text-xs font-bold text-gray-700">No messages in this class yet</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Send a message to start the discussion.</p>
          </div>
        ) : (
          classroomMessages.map((msg) => {
            const isMe = msg.senderId === currentUser?.id;
            const isTeacher = msg.senderRole === 'teacher';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5 px-1">
                  <span className="text-[10px] font-bold text-gray-600">
                    {isMe ? 'You' : msg.senderName}
                  </span>
                  {isTeacher && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-extrabold">
                      <BookOpen className="w-2.5 h-2.5" /> Teacher
                    </span>
                  )}
                  <span className="text-[9px] text-gray-400">{msg.createdAt}</span>
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs font-medium leading-relaxed break-words shadow-2xs ${
                    isMe
                      ? 'bg-[#F2A807] text-white rounded-tr-xs'
                      : 'bg-white border border-gray-200 text-[#1F1F38] rounded-tl-xs'
                  }`}
                >
                  {msg.body}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <form onSubmit={handleSend} className="p-2.5 bg-white border-t border-gray-200 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Write to your class..."
          className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#F2A807] focus:ring-2 focus:ring-[#F2A807]/20 transition"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="px-3.5 py-2 rounded-xl bg-[#F2A807] hover:bg-[#d99206] disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center transition cursor-pointer shadow-xs"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
