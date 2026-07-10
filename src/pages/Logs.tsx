import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { format } from 'date-fns';
import { ShieldAlert, User as UserIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AuditLog {
  id: string;
  action: string;
  documentId: string | null;
  details: any;
  userEmail: string;
  timestamp: string;
}

export default function Logs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Basic admin check
    if (auth.currentUser?.email === 'david.pshenichnikov@gerchik.team') {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog)));
      setLoading(false);
    }, (error) => {
      console.warn("Error fetching logs", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return <div className="flex justify-center items-center h-64 text-gray-500">Загрузка логов...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <ShieldAlert className="w-12 h-12 mb-4" />
        <h2 className="text-xl font-bold">Доступ запрещен</h2>
        <p className="text-gray-600">У вас нет прав для просмотра этой страницы.</p>
      </div>
    );
  }

  const formatAction = (action: string) => {
    switch(action) {
      case 'CREATE_STUDENT': return <span className="text-green-600 bg-green-100 px-2 py-1 rounded-full text-xs font-medium">Создание</span>;
      case 'UPDATE_STUDENT': return <span className="text-blue-600 bg-blue-100 px-2 py-1 rounded-full text-xs font-medium">Обновление</span>;
      case 'DELETE_STUDENT': return <span className="text-red-600 bg-red-100 px-2 py-1 rounded-full text-xs font-medium">Удаление</span>;
      case 'IMPORT_STUDENTS': return <span className="text-purple-600 bg-purple-100 px-2 py-1 rounded-full text-xs font-medium">Импорт</span>;
      default: return <span className="text-gray-600 bg-gray-100 px-2 py-1 rounded-full text-xs font-medium">{action}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Аудит действий</h1>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата / Время</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Пользователь</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действие</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Объект</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Детали</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 text-sm">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {format(new Date(log.timestamp), 'dd.MM.yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-gray-900">
                      <UserIcon className="w-4 h-4 mr-2 text-gray-400" />
                      {log.userEmail}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {formatAction(log.action)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-indigo-600 font-medium">
                    {log.documentId ? (
                      <Link to={`/students/${log.documentId}`} className="hover:underline">
                        Перейти к студенту
                      </Link>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto max-w-xs md:max-w-md">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    История действий пуста
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
