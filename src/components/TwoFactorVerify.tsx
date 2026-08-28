import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import * as OTPAuth from 'otpauth';

export default function TwoFactorVerify({ user, onComplete, onCancel }: { user: User, onComplete: () => void, onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const verify = async () => {
    try {
      setIsVerifying(true);
      setLocalError('');
      
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (!docSnap.exists() || !docSnap.data().totpSecret) {
         setLocalError('Секретный ключ не найден. Пожалуйста, обратитесь в поддержку.');
         setIsVerifying(false);
         return;
      }
      
      const secretStr = docSnap.data().totpSecret;
      
      const totp = new OTPAuth.TOTP({ 
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secretStr) 
      });
      
      const delta = totp.validate({ token: code, window: 1 });
      
      if (delta !== null) {
        onComplete();
      } else {
        setLocalError('Неверный код. Попробуйте еще раз.');
      }
    } catch (err: any) {
      console.error(err);
      setLocalError('Ошибка при проверке кода.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg text-center border border-gray-100">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Двухфакторная проверка</h2>
        <p className="mb-6 text-sm text-gray-500">Введите код из приложения-аутентификатора.</p>
        
        {localError && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm border border-red-100">
            {localError}
          </div>
        )}
        
        <input 
          type="text" 
          placeholder="6-значный код" 
          value={code}
          onChange={e => setCode(e.target.value)}
          className="border border-gray-300 p-3 w-full mb-6 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center text-lg tracking-widest"
          maxLength={6}
          onKeyDown={e => e.key === 'Enter' && verify()}
        />
        
        <button 
          onClick={verify} 
          disabled={isVerifying || code.length < 6}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors text-white font-medium px-4 py-3 rounded-lg w-full mb-3"
        >
          {isVerifying ? 'Проверка...' : 'Подтвердить'}
        </button>
        
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 transition-colors text-sm px-4 py-2 w-full">
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}
