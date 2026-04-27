import { useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Student, Stream } from '../lib/types';
import { handleFirestoreError, OperationType, calculateStudentMetrics } from '../lib/utils';
import { Target, TrendingDown, TrendingUp, Minus } from 'lucide-react';

export default function Analytics() {
  const [students, setStudents] = useState<Student[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [kpiHistory, setKpiHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
  
  const droppedOutCount = targetStudents.filter(s => s.delta !== undefined && s.delta <= -6).length;
  const droppedOutPercent = totalTarget > 0 ? Math.round((droppedOutCount / totalTarget) * 100) : 0;

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

  if (loading) {
    return <div>Загрузка аналитики...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Аналитика</h1>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center mb-4">
          <Target className="h-6 w-6 text-indigo-600 mr-2" />
          <h2 className="text-lg font-medium text-gray-900">🎯 KPI (Новые потоки, начиная с 42)</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col justify-between">
            <div className="text-sm font-medium text-gray-500 mb-2">% начало обучения (стартанули)</div>
            <div className="flex items-end justify-between">
              <div className={`text-3xl font-bold ${startedPercent >= 90 ? 'text-green-600' : 'text-red-600'}`}>
                {startedPercent}%
              </div>
              <div className="text-xs text-gray-500 flex flex-col items-end space-y-1">
                <div className="text-sm text-gray-500 font-medium mb-1">Цель: ≥ 90%</div>
                <div className="flex items-center">
                  <span className="mr-1">Неделя:</span>
                  {prevWeekSnapshot && prevWeekSnapshot.startedPercent !== undefined ? (
                    startedPercent > prevWeekSnapshot.startedPercent ? <span className="text-green-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{startedPercent - prevWeekSnapshot.startedPercent}%</span> :
                    startedPercent < prevWeekSnapshot.startedPercent ? <span className="text-red-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevWeekSnapshot.startedPercent - startedPercent}%</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0%</span>
                  ) : <span>нет данных</span>}
                </div>
                <div className="flex items-center">
                  <span className="mr-1">Месяц:</span>
                  {prevMonthSnapshot && prevMonthSnapshot.startedPercent !== undefined ? (
                    startedPercent > prevMonthSnapshot.startedPercent ? <span className="text-green-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{startedPercent - prevMonthSnapshot.startedPercent}%</span> :
                    startedPercent < prevMonthSnapshot.startedPercent ? <span className="text-red-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevMonthSnapshot.startedPercent - startedPercent}%</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0%</span>
                  ) : <span>нет данных</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col justify-between">
            <div className="text-sm font-medium text-gray-500 mb-2">% прохождения (макс. 2 отст.)</div>
            <div className="flex items-end justify-between">
              <div className={`text-3xl font-bold ${progressingPercent >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                {progressingPercent}%
              </div>
              <div className="text-xs text-gray-500 flex flex-col items-end space-y-1">
                <div className="text-sm text-gray-500 font-medium mb-1">Цель: ≥ 75%</div>
                <div className="flex items-center">
                  <span className="mr-1">Неделя:</span>
                  {prevWeekSnapshot && prevWeekSnapshot.progressingPercent !== undefined ? (
                    progressingPercent > prevWeekSnapshot.progressingPercent ? <span className="text-green-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{progressingPercent - prevWeekSnapshot.progressingPercent}%</span> :
                    progressingPercent < prevWeekSnapshot.progressingPercent ? <span className="text-red-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevWeekSnapshot.progressingPercent - progressingPercent}%</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0%</span>
                  ) : <span>нет данных</span>}
                </div>
                <div className="flex items-center">
                  <span className="mr-1">Месяц:</span>
                  {prevMonthSnapshot && prevMonthSnapshot.progressingPercent !== undefined ? (
                    progressingPercent > prevMonthSnapshot.progressingPercent ? <span className="text-green-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{progressingPercent - prevMonthSnapshot.progressingPercent}%</span> :
                    progressingPercent < prevMonthSnapshot.progressingPercent ? <span className="text-red-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevMonthSnapshot.progressingPercent - progressingPercent}%</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0%</span>
                  ) : <span>нет данных</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col justify-between">
            <div className="text-sm font-medium text-gray-500 mb-2">Критично отставшие</div>
            <div className="flex items-end justify-between">
              <div className="text-3xl font-bold text-gray-900">
                {criticalCountTarget}
              </div>
              <div className="text-xs text-gray-500 flex flex-col items-end space-y-1">
                <div className="text-sm text-gray-500 font-medium mb-1">Без норматива</div>
                <div className="flex items-center">
                  <span className="mr-1">Неделя:</span>
                  {prevWeekCritical !== null ? (
                    criticalCountTarget < prevWeekCritical ? <span className="text-green-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevWeekCritical - criticalCountTarget}</span> :
                    criticalCountTarget > prevWeekCritical ? <span className="text-red-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{criticalCountTarget - prevWeekCritical}</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0</span>
                  ) : <span>нет данных</span>}
                </div>
                <div className="flex items-center">
                  <span className="mr-1">Месяц:</span>
                  {prevMonthCritical !== null ? (
                    criticalCountTarget < prevMonthCritical ? <span className="text-green-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevMonthCritical - criticalCountTarget}</span> :
                    criticalCountTarget > prevMonthCritical ? <span className="text-red-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{criticalCountTarget - prevMonthCritical}</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0</span>
                  ) : <span>нет данных</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col justify-between">
            <div className="text-sm font-medium text-gray-500 mb-2">% выпавших студентов</div>
            <div className="flex items-end justify-between">
              <div className={`text-3xl font-bold ${droppedOutPercent <= 10 ? 'text-green-600' : 'text-red-600'}`}>
                {droppedOutPercent}%
              </div>
              <div className="text-xs text-gray-500 flex flex-col items-end space-y-1">
                <div className="text-sm text-gray-500 font-medium mb-1">Цель: ≤ 10%</div>
                <div className="flex items-center">
                  <span className="mr-1">Неделя:</span>
                  {prevWeekSnapshot && prevWeekSnapshot.droppedOutPercent !== undefined ? (
                    droppedOutPercent < prevWeekSnapshot.droppedOutPercent ? <span className="text-green-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevWeekSnapshot.droppedOutPercent - droppedOutPercent}%</span> :
                    droppedOutPercent > prevWeekSnapshot.droppedOutPercent ? <span className="text-red-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{droppedOutPercent - prevWeekSnapshot.droppedOutPercent}%</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0%</span>
                  ) : <span>нет данных</span>}
                </div>
                <div className="flex items-center">
                  <span className="mr-1">Месяц:</span>
                  {prevMonthSnapshot && prevMonthSnapshot.droppedOutPercent !== undefined ? (
                    droppedOutPercent < prevMonthSnapshot.droppedOutPercent ? <span className="text-green-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevMonthSnapshot.droppedOutPercent - droppedOutPercent}%</span> :
                    droppedOutPercent > prevMonthSnapshot.droppedOutPercent ? <span className="text-red-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{droppedOutPercent - prevMonthSnapshot.droppedOutPercent}%</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0%</span>
                  ) : <span>нет данных</span>}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
