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
  const targetStudents = dynamicStudents.filter(s => targetStreamIds.has(s.streamId) && s.clientType !== 'T' && s.clientType !== 'R');
  const totalTarget = targetStudents.length;

  const startedCount = targetStudents.filter(s => s.currentBlock > 0).length;
  const startedPercent = totalTarget > 0 ? Math.round((startedCount / totalTarget) * 100) : 0;

  const progressingCount = targetStudents.filter(s => s.delta !== undefined && s.delta >= -2).length;
  const progressingPercent = totalTarget > 0 ? Math.round((progressingCount / totalTarget) * 100) : 0;

  const criticalCountTarget = targetStudents.filter(s => s.status === 'critical').length;
  
  const droppedOutCount = targetStudents.filter(s => s.delta !== undefined && s.delta <= -6).length;
  const droppedOutPercent = totalTarget > 0 ? Math.round((droppedOutCount / totalTarget) * 100) : 0;

  const getAverageSnapshot = (days: number) => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - 1); // up to yesterday
    
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    
    const endStr = endDate.toISOString().split('T')[0];
    const startStr = startDate.toISOString().split('T')[0];

    const rangeSnapshots = kpiHistory.filter(h => h.date >= startStr && h.date <= endStr);
    if (rangeSnapshots.length === 0) return null;
    
    const sum = rangeSnapshots.reduce((acc, curr) => {
      acc.startedPercent += curr.startedPercent || 0;
      acc.progressingPercent += curr.progressingPercent || 0;
      acc.criticalCount += curr.criticalCount || 0;
      acc.droppedOutPercent += curr.droppedOutPercent || 0;
      return acc;
    }, { startedPercent: 0, progressingPercent: 0, criticalCount: 0, droppedOutPercent: 0 });

    const count = rangeSnapshots.length;
    return {
      startedPercent: Math.round(sum.startedPercent / count),
      progressingPercent: Math.round(sum.progressingPercent / count),
      criticalCount: Math.round(sum.criticalCount / count),
      droppedOutPercent: Math.round(sum.droppedOutPercent / count),
    };
  };

  const prevWeekAvg = getAverageSnapshot(7);
  const prevMonthAvg = getAverageSnapshot(30);

  const prevWeekCritical = prevWeekAvg ? prevWeekAvg.criticalCount : null;
  const prevMonthCritical = prevMonthAvg ? prevMonthAvg.criticalCount : null;

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
                  <span className="mr-1">За нед:</span>
                  {prevWeekAvg && prevWeekAvg.startedPercent !== undefined ? (
                    startedPercent > prevWeekAvg.startedPercent ? <span className="text-green-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{startedPercent - prevWeekAvg.startedPercent}%</span> :
                    startedPercent < prevWeekAvg.startedPercent ? <span className="text-red-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevWeekAvg.startedPercent - startedPercent}%</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0%</span>
                  ) : <span>нет данных</span>}
                </div>
                <div className="flex items-center">
                  <span className="mr-1">За мес:</span>
                  {prevMonthAvg && prevMonthAvg.startedPercent !== undefined ? (
                    startedPercent > prevMonthAvg.startedPercent ? <span className="text-green-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{startedPercent - prevMonthAvg.startedPercent}%</span> :
                    startedPercent < prevMonthAvg.startedPercent ? <span className="text-red-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevMonthAvg.startedPercent - startedPercent}%</span> :
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
                  <span className="mr-1">За нед:</span>
                  {prevWeekAvg && prevWeekAvg.progressingPercent !== undefined ? (
                    progressingPercent > prevWeekAvg.progressingPercent ? <span className="text-green-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{progressingPercent - prevWeekAvg.progressingPercent}%</span> :
                    progressingPercent < prevWeekAvg.progressingPercent ? <span className="text-red-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevWeekAvg.progressingPercent - progressingPercent}%</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0%</span>
                  ) : <span>нет данных</span>}
                </div>
                <div className="flex items-center">
                  <span className="mr-1">За мес:</span>
                  {prevMonthAvg && prevMonthAvg.progressingPercent !== undefined ? (
                    progressingPercent > prevMonthAvg.progressingPercent ? <span className="text-green-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{progressingPercent - prevMonthAvg.progressingPercent}%</span> :
                    progressingPercent < prevMonthAvg.progressingPercent ? <span className="text-red-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevMonthAvg.progressingPercent - progressingPercent}%</span> :
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
                  <span className="mr-1">За нед:</span>
                  {prevWeekCritical !== null ? (
                    criticalCountTarget < prevWeekCritical ? <span className="text-green-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevWeekCritical - criticalCountTarget}</span> :
                    criticalCountTarget > prevWeekCritical ? <span className="text-red-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{criticalCountTarget - prevWeekCritical}</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0</span>
                  ) : <span>нет данных</span>}
                </div>
                <div className="flex items-center">
                  <span className="mr-1">За мес:</span>
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
                  <span className="mr-1">За нед:</span>
                  {prevWeekAvg && prevWeekAvg.droppedOutPercent !== undefined ? (
                    droppedOutPercent < prevWeekAvg.droppedOutPercent ? <span className="text-green-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevWeekAvg.droppedOutPercent - droppedOutPercent}%</span> :
                    droppedOutPercent > prevWeekAvg.droppedOutPercent ? <span className="text-red-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{droppedOutPercent - prevWeekAvg.droppedOutPercent}%</span> :
                    <span className="text-gray-500 flex items-center"><Minus className="h-3 w-3 mr-0.5"/>0%</span>
                  ) : <span>нет данных</span>}
                </div>
                <div className="flex items-center">
                  <span className="mr-1">За мес:</span>
                  {prevMonthAvg && prevMonthAvg.droppedOutPercent !== undefined ? (
                    droppedOutPercent < prevMonthAvg.droppedOutPercent ? <span className="text-green-600 flex items-center"><TrendingDown className="h-3 w-3 mr-0.5"/>{prevMonthAvg.droppedOutPercent - droppedOutPercent}%</span> :
                    droppedOutPercent > prevMonthAvg.droppedOutPercent ? <span className="text-red-600 flex items-center"><TrendingUp className="h-3 w-3 mr-0.5"/>{droppedOutPercent - prevMonthAvg.droppedOutPercent}%</span> :
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
