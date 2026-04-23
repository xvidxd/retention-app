import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, setDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Student, Stream, Action } from '../lib/types';
import { handleFirestoreError, OperationType, calculateStudentMetrics } from '../lib/utils';
import { Link } from 'react-router-dom';
import { Users, CheckCircle, AlertTriangle, XCircle, Clock, Target, TrendingDown, TrendingUp, Minus, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const [students, setStudents] = useState<Student[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [kpiHistory, setKpiHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPage, setActionPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (!auth.currentUser) return;

    const qStudents = query(collection(db, 'students'));
    const unsubscribeStudents = onSnapshot(qStudents, (snapshot) => {
      const studentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(studentsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'students', auth);
    });

    const qStreams = query(collection(db, 'streams'));
    const unsubscribeStreams = onSnapshot(qStreams, (snapshot) => {
      const streamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stream));
      setStreams(streamsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'streams', auth);
      setLoading(false);
    });

    const qActions = query(collection(db, 'actions'));
    const unsubscribeActions = onSnapshot(qActions, (snapshot) => {
      const actionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Action));
      setActions(actionsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'actions', auth);
    });

    const qKpi = query(collection(db, 'kpi_history'));
    const unsubscribeKpi = onSnapshot(qKpi, (snapshot) => {
      const historyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setKpiHistory(historyData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'kpi_history', auth);
    });

    return () => {
      unsubscribeStudents();
      unsubscribeStreams();
      unsubscribeActions();
      unsubscribeKpi();
    };
  }, []);

  const dynamicStudents = students.map(student => {
    const stream = streams.find(s => s.id === student.streamId);
    const metrics = calculateStudentMetrics(student.currentBlock, stream);
    return { ...student, ...metrics };
  });

  // KPI Calculations
  const targetStreams = streams.filter(s => {
    const match = s.name.match(/\d+/);
    return match && parseInt(match[0]) >= 42;
  });
  const targetStreamIds = new Set(targetStreams.map(s => s.id));
  const targetStudents = dynamicStudents.filter(s => targetStreamIds.has(s.streamId));
  const totalTarget = targetStudents.length;

  const startedCount = targetStudents.filter(s => s.currentBlock > 0).length;
  const startedPercent = totalTarget > 0 ? Math.round((startedCount / totalTarget) * 100) : 0;

  const progressingCount = targetStudents.filter(s => s.delta !== undefined && s.delta >= -2).length;
  const progressingPercent = totalTarget > 0 ? Math.round((progressingCount / totalTarget) * 100) : 0;

  const criticalCountTarget = targetStudents.filter(s => s.status === 'critical').length;
  
  // Выпавшие: delta <= -6
  const droppedOutCount = targetStudents.filter(s => s.delta !== undefined && s.delta <= -6).length;
  const droppedOutPercent = totalTarget > 0 ? Math.round((droppedOutCount / totalTarget) * 100) : 0;

  useEffect(() => {
    if (!auth.currentUser || loading || totalTarget === 0) return;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const todaySnapshot = kpiHistory.find(h => h.id === todayStr);
    
    if (!todaySnapshot) {
      const saveSnapshot = async () => {
        try {
          await setDoc(doc(db, 'kpi_history', todayStr), {
            date: todayStr,
            timestamp: new Date().toISOString(),
            startedPercent,
            progressingPercent,
            criticalCount: criticalCountTarget,
            droppedOutPercent,
            totalTarget
          });
        } catch (error) {
          console.error("Error saving KPI snapshot:", error);
        }
      };
      saveSnapshot();
    }
  }, [loading, totalTarget, kpiHistory, startedPercent, progressingPercent, criticalCountTarget, droppedOutPercent]);

  const getClosestPastSnapshot = (targetDateStr: string) => {
    const pastSnapshots = kpiHistory.filter(h => h.date <= targetDateStr);
    if (pastSnapshots.length === 0) return null;
    return pastSnapshots.reduce((prev, curr) => {
      return new Date(curr.date).getTime() > new Date(prev.date).getTime() ? curr : prev;
    });
  };

  const today = new Date();
  const prevWeekDate = new Date(today);
  prevWeekDate.setDate(today.getDate() - 7);
  const prevWeekStr = prevWeekDate.toISOString().split('T')[0];
  
  const prevMonthDate = new Date(today);
  prevMonthDate.setMonth(today.getMonth() - 1);
  const prevMonthStr = prevMonthDate.toISOString().split('T')[0];

  const prevWeekSnapshot = getClosestPastSnapshot(prevWeekStr);
  const prevMonthSnapshot = getClosestPastSnapshot(prevMonthStr);

  const prevWeekCritical = prevWeekSnapshot ? prevWeekSnapshot.criticalCount : null;
  const prevMonthCritical = prevMonthSnapshot ? prevMonthSnapshot.criticalCount : null;

  const total = dynamicStudents.length;
  const normal = dynamicStudents.filter(s => s.status === 'normal').length;
  const lagging = dynamicStudents.filter(s => s.status === 'lagging').length;
  const critical = dynamicStudents.filter(s => s.status === 'critical').length;
  const notStarted = dynamicStudents.filter(s => s.status === 'not_started').length;

  const stats = [
    { name: 'Всего студентов', value: total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100', status: 'all' },
    { name: 'В норме', value: normal, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', status: 'normal' },
    { name: 'Отстают', value: lagging, icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-100', status: 'lagging' },
    { name: 'Критично', value: critical, icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', status: 'critical' },
    { name: 'Не стартовали', value: notStarted, icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100', status: 'not_started' },
  ];

  const priorityStudents = dynamicStudents
    .filter(s => s.status === 'critical' || s.status === 'lagging')
    .sort((a, b) => (a.delta || 0) - (b.delta || 0)) // Most negative delta first
    .slice(0, 10);

  const todayStr = new Date().toISOString().split('T')[0];
  
  // All pending actions with a date
  const pendingActions = actions
    .filter(a => a.nextActionDate && (a.isCompleted === undefined || a.isCompleted === false))
    .sort((a, b) => {
      // Sort by nextActionDate first
      const dateCompare = a.nextActionDate!.localeCompare(b.nextActionDate!);
      if (dateCompare !== 0) return dateCompare;
      // If dates are same, sort by action creation date (newest first)
      return b.date.localeCompare(a.date);
    });

  const overdueActions = pendingActions.filter(a => a.nextActionDate! < todayStr);
  const upcomingActionsTotal = pendingActions.filter(a => a.nextActionDate! >= todayStr);
  
  // Flattened list for pagination
  const allDashboardActions = [...overdueActions, ...upcomingActionsTotal];
  const totalActionPages = Math.max(1, Math.ceil(allDashboardActions.length / itemsPerPage));
  
  useEffect(() => {
    if (actionPage > totalActionPages) {
      setActionPage(totalActionPages);
    }
  }, [allDashboardActions.length, totalActionPages, actionPage]);

  if (loading) {
    return <div>Загрузка дашборда...</div>;
  }

  const displayedActions = allDashboardActions.slice((actionPage - 1) * itemsPerPage, actionPage * itemsPerPage);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((item) => (
          <Link 
            key={item.name} 
            to={`/students${item.status !== 'all' ? `?status=${item.status}` : ''}`}
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow cursor-pointer block"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`p-3 rounded-md ${item.bg}`}>
                    <item.icon className={`h-6 w-6 ${item.color}`} aria-hidden="true" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{item.name}</dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">{item.value}</div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Students */}
        <div className="bg-white shadow rounded-lg p-6 lg:col-span-2">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Приоритетные студенты</h2>
          {priorityStudents.length > 0 ? (
            <ul className="divide-y divide-gray-200">
              {priorityStudents.map((student) => (
                <li key={student.id} className="py-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {student.clientType && (
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                        student.clientType === 'A' ? 'bg-green-100 text-green-800 border-green-200' :
                        student.clientType === 'B' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                        'bg-red-100 text-red-800 border-red-200'
                      }`}>
                        {student.clientType}
                      </span>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{student.email}</p>
                      <p className="text-sm text-gray-500">Поток: {student.streamName || student.streamId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      student.status === 'critical' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      Отставание: {student.delta}
                    </span>
                    <Link to={`/students/${student.id}`} className="text-indigo-600 hover:text-indigo-900 text-sm font-medium">
                      Карточка &rarr;
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Нет приоритетных студентов для работы.</p>
          )}
        </div>

        {/* Upcoming Actions */}
        <div className="bg-white shadow rounded-lg p-6 lg:col-span-1 flex flex-col h-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">Следующий звонок</h2>
            {totalActionPages > 1 && (
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => setActionPage(p => Math.max(1, p - 1))}
                  disabled={actionPage === 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-gray-500 font-medium">{actionPage} / {totalActionPages}</span>
                <button 
                  onClick={() => setActionPage(p => Math.min(totalActionPages, p + 1))}
                  disabled={actionPage === totalActionPages}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1">
            {displayedActions.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {displayedActions.map((action) => {
                  const student = students.find(s => s.id === action.studentId);
                  const isOverdue = action.nextActionDate! < todayStr;
                  
                  return (
                    <li key={action.id} className="py-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2 truncate pr-4">
                          {student?.clientType && (
                            <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                              student.clientType === 'A' ? 'bg-green-100 text-green-800 border-green-200' :
                              student.clientType === 'B' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                              'bg-red-100 text-red-800 border-red-200'
                            }`}>
                              {student.clientType}
                            </span>
                          )}
                          <p className="text-sm font-medium text-gray-900 truncate" title={student?.email}>
                            {student?.email || 'Неизвестный студент'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={cn(
                            "text-sm font-medium whitespace-nowrap",
                            isOverdue ? "text-red-600 flex items-center" : "text-indigo-600"
                          )}>
                            {isOverdue && <AlertCircle className="h-3 w-3 mr-1" />}
                            {new Date(action.nextActionDate!).toLocaleDateString('ru-RU')}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 flex justify-between items-end">
                        <p className="text-xs text-gray-500 line-clamp-2 pr-2" title={action.comment}>
                          {action.comment || 'Нет комментария'}
                        </p>
                        <Link to={`/students/${action.studentId}`} className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap">
                          Карточка &rarr;
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">Нет запланированных звонков.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
