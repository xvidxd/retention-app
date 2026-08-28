/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Streams from './pages/Streams';
import Analytics from './pages/Analytics';
import StudentProfile from './pages/StudentProfile';
import Logs from './pages/Logs';
import TwoFactorSetup from './components/TwoFactorSetup';
import TwoFactorVerify from './components/TwoFactorVerify';
import { DataProvider } from './context/DataContext';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  
  // Custom 2FA states
  const [requires2FASetup, setRequires2FASetup] = useState(false);
  const [requires2FAVerify, setRequires2FAVerify] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check Firestore to see if user has 2FA set up
        try {
          const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (docSnap.exists() && docSnap.data().totpSecret) {
            setRequires2FAVerify(true);
            setRequires2FASetup(false);
          } else {
            setRequires2FASetup(true);
            setRequires2FAVerify(false);
          }
        } catch (e: any) {
          console.error("Error checking 2FA status", e);
          let errorMsg = e.message;
          if (e.message.includes('offline')) {
            errorMsg = 'Не удалось подключиться к базе данных. Убедитесь, что база (default) создана в консоли Firebase.';
          }
          // If there's an error (e.g. permission denied while rules propagate), show it on the login screen
          setLoginError(`Ошибка при проверке 2FA: ${errorMsg}. Пожалуйста, обновите страницу.`);
          await signOut(auth); // Log them out to prevent bypassing 2FA
          setUser(null);
        }
      } else {
        setUser(null);
        setRequires2FASetup(false);
        setRequires2FAVerify(false);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      setLoginError(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login error:", error);
      setLoginError("Ошибка при входе. Пожалуйста, попробуйте еще раз.");
    }
  };
  
  const handleLogout = async () => {
    await signOut(auth);
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

  if (requires2FASetup) {
    return <TwoFactorSetup user={user} onComplete={() => {
      setRequires2FASetup(false);
      setRequires2FAVerify(false);
    }} />;
  }
  
  if (requires2FAVerify) {
    return <TwoFactorVerify user={user} onComplete={() => setRequires2FAVerify(false)} onCancel={handleLogout} />;
  }

  return (
    <DataProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="students" element={<Students />} />
            <Route path="students/:id" element={<StudentProfile />} />
            <Route path="streams" element={<Streams />} />
            <Route path="logs" element={<Logs />} />
          </Route>
        </Routes>
      </Router>
    </DataProvider>
  );
}
