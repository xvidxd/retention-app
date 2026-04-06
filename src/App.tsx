/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Streams from './pages/Streams';
import StudentProfile from './pages/StudentProfile';
import { useEffect, useState } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setLoginError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
      setLoginError("Ошибка при входе. Пожалуйста, попробуйте еще раз.");
    }
  };

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">Загрузка...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8 bg-white shadow rounded-lg text-center">
          <h2 className="text-2xl font-bold text-gray-900">Вход в систему</h2>
          <p className="text-gray-500 mb-8">Retention Dashboard</p>
          {loginError && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 text-left">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-red-400 font-bold">!</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{loginError}</p>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogin}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Войти через Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="streams" element={<Streams />} />
        </Route>
      </Routes>
    </Router>
  );
}
