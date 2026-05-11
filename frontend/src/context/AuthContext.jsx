import { createContext, useContext, useEffect, useState } from 'react';
import { fetchUsers, setMockUserId } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchUsers()
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        setUsers(list);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err);
        setUsers([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (users.length === 0) return;
    const storedId = localStorage.getItem('mock_user_id');
    const preferred = users.find((u) => String(u.id) === storedId) || users[0];
    setCurrentUser((prev) => (prev && prev.id === preferred.id ? prev : preferred));
  }, [users]);

  useEffect(() => {
    if (!currentUser) {
      setMockUserId(null);
      return;
    }
    setMockUserId(currentUser.id);
    localStorage.setItem('mock_user_id', String(currentUser.id));
  }, [currentUser]);

  const setCurrentUserId = (id) => {
    const numericId = id != null && id !== '' ? Number(id) : null;
    const selected = users.find((u) => u.id === numericId) || null;
    setCurrentUser(selected);
  };

  return (
    <AuthContext.Provider
      value={{
        users,
        currentUser,
        loading,
        error,
        setCurrentUserId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
