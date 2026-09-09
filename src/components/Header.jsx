import React from 'react';
import { useApp } from '../context/AppContext';
import { Snai3iIcon } from './Snai3iIcon';
import { LogOut } from 'lucide-react';

export const Header = () => {
  const { currentUser, signOut } = useApp();

  if (!currentUser) return null;

  const isStudent = currentUser.role === 'student';
  const isAdmin = currentUser.role === 'admin';

  return (
    <nav className="nav">
      <div className={`nav-inner ${isStudent ? 'student-nav' : ''}`}>
        {/* BRAND & SECTION TITLE */}
        <div className="nav-brand">
          <div className="flex items-center">
            <Snai3iIcon className="h-8 w-8" fill="#F2A807" />
          </div>
          <div className="divider-v"></div>
          <span className="nav-title">
            {isAdmin ? 'Admin Panel' : isStudent ? 'My Points' : 'My Class'}
          </span>
          {isAdmin && <span className="badge-admin">Admin</span>}
        </div>

        {/* RIGHT: AVATAR, NAME, SIGN OUT */}
        <div className="nav-right">
          <div className={`avatar ${isAdmin ? 'admin' : ''}`}>
            {currentUser.firstName?.[0] || 'U'}
          </div>
          <span className="user-name">
            {currentUser.firstName} {currentUser.lastName}
          </span>
          <button
            onClick={signOut}
            className="sign-out-btn"
            title="Sign out"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
};
