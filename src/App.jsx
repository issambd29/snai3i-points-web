import React from 'react';
import { useApp } from './context/AppContext';
import { Header } from './components/Header';
import { SignIn } from './components/SignIn';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentDashboard } from './components/StudentDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { GlobalToast } from './components/GlobalToast';

export const App = () => {
  const { currentUser, loading } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9f9fb]" role="status" aria-live="polite">
        <span className="inline-block w-8 h-8 border-4 border-[#F2A807] border-t-transparent rounded-full animate-spin" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <SignIn />
        <GlobalToast />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f9fb] text-[#1F1F38]">
      <Header />
      <main className="pb-16">
        {/* Branch managers use the admin dashboard, limited to their branch (the server enforces it). */}
        {(currentUser.role === 'admin' || currentUser.role === 'manager') && <AdminDashboard />}
        {currentUser.role === 'teacher' && <TeacherDashboard />}
        {currentUser.role === 'student' && <StudentDashboard />}
      </main>
      <GlobalToast />
    </div>
  );
};

export default App;
