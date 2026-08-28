import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import QRCode from 'qrcode';
import * as OTPAuth from 'otpauth';

export default function TwoFactorSetup({ user, onComplete }: { user: User, onComplete: () => void }) {
  const [qrUrl, setQrUrl] = useState('');
  const [secretStr, setSecretStr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function setup() {
      try {
        const newSecret = new OTPAuth.Secret({ size: 20 });
        const totp = new OTPAuth.TOTP({
          issuer: 'Retention Dashboard',
          label: user.email || 'User',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: newSecret
        });
        
        const base32Secret = newSecret.base32;
        setSecretStr(base32Secret);
        
        const url = totp.toString();
        const img = await QRCode.toDataURL(url);
        setQrUrl(img);
      } catch (err: any) {
        console.error(err);
        setError('Ошибка при генерации QR-кода.');
      }
    }
    setup();
  }, [user]);

  const verify = async () => {
    try {
      const totp = new OTPAuth.TOTP({ 
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secretStr) 
      });
      
      const delta = totp.validate({ token: code, window: 1 });
      
      if (delta !== null) {
        // Код верный, сохраняем секрет в базу данных пользователя
        await setDoc(doc(db, 'users', user.uid), { totpSecret: secretStr }, { merge: true });
        onComplete();
      } else {
        setError('Неверный код. Попробуйте еще раз.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ошибка проверки кода');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg text-center border border-gray-100">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">Настройка 2FA</h2>
        <p className="mb-6 text-sm text-gray-500">Дополнительная защита вашего аккаунта</p>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm border border-red-100">
            {error}
          </div>
        )}
        
        {qrUrl ? (
          <>
            <div className="bg-gray-50 p-4 rounded-lg mb-6 inline-block">
               <img src={qrUrl} alt="QR Code" className="mx-auto" />
            </div>
            <p className="mb-4 text-sm text-gray-600">
              Отсканируйте этот QR-код в приложении-аутентификаторе (например, Google Authenticator или Authy).
            </p>
            <input 
              type="text" 
              placeholder="Введите 6-значный код" 
              value={code}
              onChange={e => setCode(e.target.value)}
              className="border border-gray-300 p-3 w-full mb-4 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center text-lg tracking-widest"
              maxLength={6}
            />
            <button onClick={verify} className="bg-indigo-600 hover:bg-indigo-700 transition-colors text-white font-medium px-4 py-3 rounded-lg w-full">
              Подтвердить и включить
            </button>
          </>
        ) : (
          !error && <p className="text-gray-500 animate-pulse">Генерация ключа...</p>
        )}
      </div>
    </div>
  );
}
