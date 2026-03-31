import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, adminLogin, adminLogout } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAdmin(user?.email === 'admin@funding.com');
      setLoading(false);
    });
    return unsubscribe;
  }, []);
  
  const login = async (email, password) => {
    const user = await adminLogin(email, password);
    setUser(user);
    setIsAdmin(true);
    return user;
  };
  
  const logout = async () => {
    await adminLogout();
    setUser(null);
    setIsAdmin(false);
  };
  
  const value = {
    user,
    isAdmin,
    loading,
    login,
    logout
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};