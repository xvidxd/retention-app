import { useEffect, useState, useRef, useMemo } from 'react';
import { collection, onSnapshot, query, writeBatch, doc, deleteDoc, addDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Student, Stream } from '../lib/types';
import { handleFirestoreError, OperationType, calculateStudentMetrics } from '../lib/utils';
import { Link, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Trash2, Edit2, Plus, ChevronDown, ChevronUp, XCircle, AlertTriangle } from 'lucide-react';

export default function Students() {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const statusFilter = queryParams.get('status');

  const [students, setStudents] = useState<Student[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expandedStreams, setExpandedStreams] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({ email: '', streamName: '', currentBlock: 1 });
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const duplicateGroups = useMemo(() => {
    const groups: Record<string, Student[]> = {};
    students.forEach(s => {
      if (!s.email) return;
      const email = s.email.toLowerCase().trim();
      if (!groups[email]) groups[email] = [];
      groups[email].push(s);
    });
    return Object.entries(groups)
      .filter(([_, group]) => group.length > 1)
      .map(([email, group]) => ({ email, students: group }));
  }, [students]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const qStudents = query(collection(db, 'students'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      setStudents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'students', auth));

    const qStreams = query(collection(db, 'streams'));
    const unsubStreams = onSnapshot(qStreams, (snapshot) => {
      setStreams(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Stream)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'streams', auth));

    return () => {
      unsubStudents();
      unsubStreams();
    };
  }, []);

  const toggleStream = (streamId: string) => {
    const newSet = new Set(expandedStreams);
    if (newSet.has(streamId)) newSet.delete(streamId);
    else newSet.add(streamId);
    setExpandedStreams(newSet);
  };

  const findStreamByNameOrNumber = (searchName: string) => {
    let stream = streams.find(s => s.name === searchName);
    if (!stream) {
      const inputMatch = searchName.match(/\d+/);
      const inputNum = inputMatch ? parseInt(inputMatch[0], 10) : null;
      if (inputNum !== null) {
        stream = streams.find(s => {
          const sMatch = s.name.match(/\d+/);
          const sNum = sMatch ? parseInt(sMatch[0], 10) : null;
          return sNum === inputNum;
        });
      }
    }
    return stream;
  };

  const processData = async (rows: any[], fileName: string) => {
    try {
      const importDate = new Date().toISOString();
      const importRef = doc(collection(db, 'imports'));
      
      const batches: Promise<void>[] = [];
      let currentBatch = writeBatch(db);
      let operationCount = 0;

      const commitCurrentBatch = () => {
        batches.push(currentBatch.commit());
        currentBatch = writeBatch(db);
        operationCount = 0;
      };

      currentBatch.set(importRef, {
        date: importDate,
        fileName: fileName,
        totalStudents: rows.length
      });
      operationCount++;

      for (const row of rows) {
        const email = (row['Email'] || row['email'] || row['EMAIL'])?.toString().trim();
        const streamName = (row['Поток'] || row['stream'] || row['STREAM'])?.toString().trim();
        const blockRaw = row['Блок'] ?? row['block'] ?? row['BLOCK'];
        
        if (!email || !streamName || blockRaw === undefined) continue;
        
        const currentBlock = parseInt(blockRaw, 10) || 0;

        let stream = findStreamByNameOrNumber(streamName);
        let finalStreamName = stream ? stream.name : streamName;
        if (!stream && /^\d+$/.test(streamName.trim())) {
          finalStreamName = `${streamName.trim()} поток`;
        }
        let streamId = stream?.id;
        
        if (!stream) {
          const newStreamRef = doc(collection(db, 'streams'));
          streamId = newStreamRef.id;
          currentBatch.set(newStreamRef, {
            name: finalStreamName,
            blockDates: {},
            createdAt: importDate
          });
          operationCount++;
          if (operationCount >= 490) commitCurrentBatch();

          stream = { id: streamId, name: finalStreamName, blockDates: {}, createdAt: importDate };
          streams.push(stream);
        }

        const { expectedBlock, delta, status } = calculateStudentMetrics(currentBlock, stream);

        const existingStudent = students.find(s => s.email === email);
        const studentRef = existingStudent ? doc(db, 'students', existingStudent.id) : doc(collection(db, 'students'));
        
        let noMovementCount = existingStudent?.noMovementCount || 0;
        if (existingStudent && existingStudent.currentBlock === currentBlock) {
          noMovementCount += 1;
        } else {
          noMovementCount = 0;
        }

        currentBatch.set(studentRef, {
          email,
          streamId,
          streamName: finalStreamName,
          currentBlock,
          expectedBlock,
          delta,
          status,
          noMovementCount,
          updatedAt: importDate
        }, { merge: true });
        operationCount++;
        if (operationCount >= 490) commitCurrentBatch();

        const progressRef = doc(collection(db, 'progress'));
        currentBatch.set(progressRef, {
          studentId: studentRef.id,
          importId: importRef.id,
          date: importDate,
          block: currentBlock
        });
        operationCount++;
        if (operationCount >= 490) commitCurrentBatch();
      }

      if (operationCount > 0) {
        batches.push(currentBatch.commit());
      }

      await Promise.all(batches);
      setSuccessMessage('Импорт успешно завершен!');
    } catch (error) {
      console.error("Import error:", error);
      setErrorMessage('Ошибка при импорте. Проверьте консоль.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    if (file.name.toLowerCase().endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results.data, file.name);
        },
        error: (error) => {
          console.error("CSV Parse error:", error);
          setErrorMessage('Ошибка чтения CSV файла');
          setImporting(false);
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = evt.target?.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet) as any[];
          processData(rows, file.name);
        } catch (error) {
          console.error("Excel Parse error:", error);
          setErrorMessage('Ошибка чтения Excel файла');
          setImporting(false);
        }
      };
      reader.onerror = () => {
        setErrorMessage('Ошибка чтения файла');
        setImporting(false);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleDeleteStudent = (id: string) => {
    setStudentToDelete(id);
  };

  const confirmDeleteStudent = async () => {
    if (!studentToDelete) return;
    try {
      await deleteDoc(doc(db, 'students', studentToDelete));
      setStudentToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${studentToDelete}`, auth);
    }
  };

  const openAddModal = () => {
    setEditingStudent(null);
    setFormData({ email: '', streamName: '', currentBlock: 1 });
    setIsModalOpen(true);
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setFormData({ 
      email: student.email, 
      streamName: student.streamName, 
      currentBlock: student.currentBlock 
    });
    setIsModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const email = formData.email.trim();
    const streamName = formData.streamName.trim();
    const currentBlock = parseInt(formData.currentBlock.toString(), 10);
    
    if (!email || !streamName || isNaN(currentBlock)) return;

    try {
      let stream = findStreamByNameOrNumber(streamName);
      let finalStreamName = stream ? stream.name : streamName;
      if (!stream && /^\d+$/.test(streamName.trim())) {
        finalStreamName = `${streamName.trim()} поток`;
      }
      let streamId = stream?.id;
      
      if (!stream) {
        const newStreamRef = await addDoc(collection(db, 'streams'), {
          name: finalStreamName,
          blockDates: {},
          createdAt: new Date().toISOString()
        });
        streamId = newStreamRef.id;
        stream = { id: streamId, name: finalStreamName, blockDates: {}, createdAt: new Date().toISOString() };
      }

      const { expectedBlock, delta, status } = calculateStudentMetrics(currentBlock, stream);

      const studentData = {
        email,
        streamId,
        streamName: finalStreamName,
        currentBlock,
        expectedBlock,
        delta,
        status,
        updatedAt: new Date().toISOString()
      };

      if (editingStudent) {
        await setDoc(doc(db, 'students', editingStudent.id), studentData, { merge: true });
      } else {
        await addDoc(collection(db, 'students'), { ...studentData, noMovementCount: 0 });
      }

      setIsModalOpen(false);
      setEditingStudent(null);
      setFormData({ email: '', streamName: '', currentBlock: 1 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'students', auth);
    }
  };

  if (loading) return <div>Загрузка студентов...</div>;

  const dynamicStudents = students.map(student => {
    const stream = streams.find(s => s.id === student.streamId);
    const metrics = calculateStudentMetrics(student.currentBlock, stream);
    return { ...student, ...metrics };
  });

  const filteredStudents = dynamicStudents.filter(student => {
    if (!statusFilter || statusFilter === 'all') return true;
    return student.status === statusFilter;
  });

  const sortedStreams = [...streams].sort((a, b) => {
    const numA = parseInt(a.name.match(/\d+/)?.[0] || '0', 10);
    const numB = parseInt(b.name.match(/\d+/)?.[0] || '0', 10);
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-900">Студенты</h1>
          {statusFilter && statusFilter !== 'all' && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
              Фильтр: {
                statusFilter === 'critical' ? 'Критично' :
                statusFilter === 'lagging' ? 'Отстают' :
                statusFilter === 'normal' ? 'В норме' :
                statusFilter === 'not_started' ? 'Не стартовали' : statusFilter
              }
              <Link to="/students" className="ml-2 text-indigo-500 hover:text-indigo-700">
                <XCircle className="h-4 w-4" />
              </Link>
            </span>
          )}
        </div>
        <div className="flex space-x-3">
          {duplicateGroups.length > 0 && (
            <button
              onClick={() => setShowDuplicatesModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Дубликаты ({duplicateGroups.length})
            </button>
          )}
          <button
            onClick={openAddModal}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none"
          >
            <Plus className="h-4 w-4 mr-2" />
            Добавить
          </button>
          
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImport}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50"
          >
            {importing ? 'Импорт...' : 'Импорт Excel/CSV'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {sortedStreams.map(stream => {
          const streamStudents = filteredStudents.filter(s => s.streamId === stream.id);
          if (streamStudents.length === 0) return null;
          
          const isExpanded = expandedStreams.has(stream.id);
          
          return (
            <div key={stream.id} className="bg-white shadow rounded-lg overflow-hidden">
              <button 
                className="w-full px-6 py-4 flex justify-between items-center bg-gray-50 hover:bg-gray-100 focus:outline-none"
                onClick={() => toggleStream(stream.id)}
              >
                <div className="flex items-center">
                  <h3 className="text-lg font-medium text-gray-900">
                    {stream.name}
                  </h3>
                  <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                    {streamStudents.length}
                  </span>
                </div>
                {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
              </button>
              
              {isExpanded && (
                <div className="border-t border-gray-200 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Блок</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дельта</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {streamStudents.map(student => {
                        return (
                        <tr key={student.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            {student.clientType ? (
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                                student.clientType === 'A' ? 'bg-green-100 text-green-800 border-green-200' :
                                student.clientType === 'B' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                'bg-red-100 text-red-800 border-red-200'
                              }`}>
                                {student.clientType}
                              </span>
                            ) : (
                              <span className="w-6 h-6 rounded-full border border-gray-200 bg-gray-50"></span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                            <Link to={`/students/${student.id}`}>{student.email}</Link>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.currentBlock === 0 ? 'Не стартовал (0)' : student.currentBlock}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              student.status === 'critical' ? 'bg-red-100 text-red-800' :
                              student.status === 'lagging' ? 'bg-yellow-100 text-yellow-800' :
                              student.status === 'not_started' ? 'bg-gray-100 text-gray-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {student.status === 'critical' ? 'Критично' :
                               student.status === 'lagging' ? 'Отстает' :
                               student.status === 'not_started' ? 'Не стартовал' : 'В норме'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={student.delta && student.delta < 0 ? 'text-red-600 font-bold' : ''}>
                              {student.delta}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button 
                              onClick={() => openEditModal(student)} 
                              className="text-indigo-600 hover:text-indigo-900 mr-4"
                              title="Редактировать"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteStudent(student.id)} 
                              className="text-red-600 hover:text-red-900"
                              title="Удалить"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        
        {/* Студенты без потока */}
        {(() => {
          const orphanedStudents = students.filter(s => !streams.some(st => st.id === s.streamId));
          if (orphanedStudents.length === 0) return null;
          
          const isExpanded = expandedStreams.has('orphaned');
          
          return (
            <div key="orphaned" className="bg-white shadow rounded-lg overflow-hidden">
              <button 
                className="w-full px-6 py-4 flex justify-between items-center bg-gray-50 hover:bg-gray-100 focus:outline-none"
                onClick={() => toggleStream('orphaned')}
              >
                <div className="flex items-center">
                  <h3 className="text-lg font-medium text-gray-900">
                    Без потока
                  </h3>
                  <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                    {orphanedStudents.length}
                  </span>
                </div>
                {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
              </button>
              
              {isExpanded && (
                <div className="border-t border-gray-200 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Поток (в базе)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Блок</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дельта</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {orphanedStudents.map(student => {
                        const metrics = calculateStudentMetrics(student.currentBlock, undefined);
                        return (
                        <tr key={student.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            {student.clientType ? (
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                                student.clientType === 'A' ? 'bg-green-100 text-green-800 border-green-200' :
                                student.clientType === 'B' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                                'bg-red-100 text-red-800 border-red-200'
                              }`}>
                                {student.clientType}
                              </span>
                            ) : (
                              <span className="w-6 h-6 rounded-full border border-gray-200 bg-gray-50"></span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                            <Link to={`/students/${student.id}`}>{student.email}</Link>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {student.streamName || 'Неизвестно'}
                            <div className="text-xs text-red-500">Поток удален или не найден</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.currentBlock === 0 ? 'Не стартовал (0)' : student.currentBlock}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              metrics.status === 'critical' ? 'bg-red-100 text-red-800' :
                              metrics.status === 'lagging' ? 'bg-yellow-100 text-yellow-800' :
                              metrics.status === 'not_started' ? 'bg-gray-100 text-gray-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {metrics.status === 'critical' ? 'Критично' :
                               metrics.status === 'lagging' ? 'Отстает' :
                               metrics.status === 'not_started' ? 'Не стартовал' : 'В норме'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={metrics.delta && metrics.delta < 0 ? 'text-red-600 font-bold' : ''}>
                              {metrics.delta}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button 
                              onClick={() => openEditModal(student)} 
                              className="text-indigo-600 hover:text-indigo-900 mr-4"
                              title="Редактировать"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteStudent(student.id)} 
                              className="text-red-600 hover:text-red-900"
                              title="Удалить"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {students.length === 0 && (
          <div className="text-center py-10 bg-white shadow rounded-lg">
            <p className="text-gray-500">Студентов пока нет. Загрузите файл или добавьте вручную.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingStudent ? 'Редактировать студента' : 'Добавить студента'}
            </h3>
            <form onSubmit={handleSaveStudent}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Поток</label>
                  <input
                    type="text"
                    required
                    value={formData.streamName}
                    onChange={(e) => setFormData({...formData, streamName: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Например: 10 поток"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Текущий блок</label>
                  <input
                    type="number"
                    min="0"
                    max="13"
                    required
                    value={formData.currentBlock}
                    onChange={(e) => setFormData({...formData, currentBlock: parseInt(e.target.value, 10)})}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDuplicatesModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-yellow-100 mr-4">
                  <AlertTriangle className="h-6 w-6 text-yellow-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">
                  Дубликаты студентов
                </h3>
              </div>
              <button
                onClick={() => setShowDuplicatesModal(false)}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <span className="sr-only">Закрыть</span>
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {duplicateGroups.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Дубликатов не найдено.</p>
              ) : (
                <div className="space-y-6">
                  {duplicateGroups.map(group => (
                    <div key={group.email} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <h4 className="text-md font-bold text-gray-800">{group.email}</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-white">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Поток</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Блок</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Обновлен</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {group.students.map(student => (
                              <tr key={student.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {student.streamName || 'Без потока'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                  {student.currentBlock}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                  {new Date(student.updatedAt).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                  <button
                                    onClick={() => handleDeleteStudent(student.id)}
                                    className="text-red-600 hover:text-red-900 inline-flex items-center"
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Удалить
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowDuplicatesModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {studentToDelete && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Подтверждение удаления</h3>
            <p className="text-sm text-gray-500 mb-6">
              Вы уверены, что хотите удалить этого студента? Это действие нельзя отменить.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setStudentToDelete(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
              >
                Отмена
              </button>
              <button
                onClick={confirmDeleteStudent}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-red-100 mr-4">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">Ошибка</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">{errorMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setErrorMessage(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-green-100 mr-4">
                <div className="h-6 w-6 text-green-600 flex items-center justify-center">✓</div>
              </div>
              <h3 className="text-lg font-medium text-gray-900">Успешно</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">{successMessage}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setSuccessMessage(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
