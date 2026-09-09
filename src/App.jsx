import React from 'react';
import { useApp } from './context/AppContext';
import { Header } from './components/Header';
import { SignIn } from './components/SignIn';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentDashboard } from './components/StudentDashboard';
import { AdminDashboard } from './components/AdminDashboard';

export const App = () => {
  const { currentUser } = useApp();

  if (!currentUser) {
    return <SignIn />;
  }

  return (
    <div className="min-h-screen bg-[#f9f9fb] text-[#1F1F38]">
      <Header />
      <main className="pb-16">
        {currentUser.role === 'admin' && <AdminDashboard />}
        {currentUser.role === 'teacher' && <TeacherDashboard />}
        {currentUser.role === 'student' && <StudentDashboard />}
      </main>
    </div>
  );
};

export default App;
