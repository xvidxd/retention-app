import { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, setDoc, doc, addDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Stream } from '../lib/types';
import { handleFirestoreError, OperationType, calculateStreamEndDate } from '../lib/utils';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { Trash2 } from 'lucide-react';

export default function Streams() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const [newStreamName, setNewStreamName] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{type: 'single' | 'bulk', id?: string} | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(collection(db, 'streams'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const streamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stream));
      setStreams(streamsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'streams', auth);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleCreateStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStreamName.trim()) return;

    try {
      await addDoc(collection(db, 'streams'), {
        name: newStreamName,
        blockDates: {},
        createdAt: new Date().toISOString()
      });
      setNewStreamName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'streams', auth);
    }
  };

  const handleUpdateBlockDate = async (streamId: string, blockNum: number, dateStr: string) => {
    const stream = streams.find(s => s.id === streamId);
    if (!stream) return;

    const updatedBlockDates = { ...stream.blockDates, [blockNum]: dateStr };
    
    try {
      await setDoc(doc(db, 'streams', streamId), {
        ...stream,
        blockDates: updatedBlockDates
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `streams/${streamId}`, auth);
    }
  };

  const toggleSelection = (streamId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedForDeletion);
    if (newSet.has(streamId)) {
      newSet.delete(streamId);
    } else {
      newSet.add(streamId);
    }
    setSelectedForDeletion(newSet);
  };

  const executeSingleDelete = async (streamId: string) => {
    try {
      await deleteDoc(doc(db, 'streams', streamId));
      if (selectedStream?.id === streamId) setSelectedStream(null);
      if (selectedForDeletion.has(streamId)) {
        const newSet = new Set(selectedForDeletion);
        newSet.delete(streamId);
        setSelectedForDeletion(newSet);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `streams/${streamId}`, auth);
    }
  };

  const executeBulkDelete = async () => {
    try {
      const batch = writeBatch(db);
      selectedForDeletion.forEach(id => {
        batch.delete(doc(db, 'streams', id));
      });
      await batch.commit();
      
      if (selectedStream && selectedForDeletion.has(selectedStream.id)) {
        setSelectedStream(null);
      }
      setSelectedForDeletion(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'streams', auth);
    }
  };

  const handleImportStreams = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (rows.length < 2) throw new Error("Invalid format");

        // Find the row that contains "Блок 1" to dynamically locate the header
        let headerRowIdx = -1;
        let firstBlockRowIdx = -1;
        
        for (let i = 0; i < rows.length; i++) {
          const firstCell = String(rows[i][0] || '').trim().toLowerCase();
          if (firstCell.includes('блок 1') || firstCell === '1') {
            firstBlockRowIdx = i;
            headerRowIdx = i - 1;
            break;
          }
        }

        if (firstBlockRowIdx === -1 || headerRowIdx === -1) {
          throw new Error("Не удалось найти строку 'Блок 1' в первом столбце");
        }

        const streamNames = rows[headerRowIdx] || [];
        const maxCols = Math.max(...rows.map(r => r?.length || 0));
        const batch = writeBatch(db);
        const importDate = new Date().toISOString();

        for (let col = 1; col < maxCols; col++) {
          const streamNameVal = streamNames[col];
          if (!streamNameVal) continue;
          const streamName = String(streamNameVal).trim();
          if (!streamName) continue;

          const blockDates: Record<number, string> = {};
          
          for (let i = 0; i < 13; i++) {
            const rowIdx = firstBlockRowIdx + i;
            if (!rows[rowIdx]) continue;
            
            const blockStr = String(rows[rowIdx][0] || '');
            const blockMatch = blockStr.match(/\d+/);
            const blockNum = blockMatch ? parseInt(blockMatch[0], 10) : NaN;
            
            const rawDate = rows[rowIdx][col];
            
            if (!isNaN(blockNum) && rawDate) {
              let isoDate = '';
              if (rawDate instanceof Date) {
                // Use UTC methods because XLSX parses dates as UTC midnight
                const year = rawDate.getUTCFullYear();
                const month = String(rawDate.getUTCMonth() + 1).padStart(2, '0');
                const day = String(rawDate.getUTCDate()).padStart(2, '0');
                isoDate = `${year}-${month}-${day}`;
              } else if (typeof rawDate === 'number') {
                const d = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
                const year = d.getUTCFullYear();
                const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                const day = String(d.getUTCDate()).padStart(2, '0');
                isoDate = `${year}-${month}-${day}`;
              } else if (typeof rawDate === 'string') {
                const parts = rawDate.trim().split('.');
                if (parts.length === 3) {
                  const day = parts[0].padStart(2, '0');
                  const month = parts[1].padStart(2, '0');
                  const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                  isoDate = `${year}-${month}-${day}`;
                } else {
                  try {
                    const d = new Date(rawDate);
                    if (!isNaN(d.getTime())) {
                      const year = d.getFullYear();
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const day = String(d.getDate()).padStart(2, '0');
                      isoDate = `${year}-${month}-${day}`;
                    }
                  } catch (e) {}
                }
              }
              if (isoDate) {
                blockDates[blockNum] = isoDate;
              }
            }
          }

          const existingStream = streams.find(s => s.name === streamName);
          if (existingStream) {
            const streamRef = doc(db, 'streams', existingStream.id);
            batch.update(streamRef, { blockDates, updatedAt: importDate });
          } else {
            const streamRef = doc(collection(db, 'streams'));
            batch.set(streamRef, { name: streamName, blockDates, createdAt: importDate });
          }
        }

        await batch.commit();
        setSuccessMessage('Потоки успешно импортированы!');
      } catch (error) {
        console.error("Import error:", error);
        setErrorMessage('Ошибка при импорте потоков. Проверьте формат файла.');
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setErrorMessage('Ошибка чтения файла');
      setImporting(false);
    };
    reader.readAsArrayBuffer(file);
  };

  if (loading) return <div>Загрузка потоков...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Потоки</h1>
        <div>
          <input
            type="file"
            accept=".xlsx, .xls, .csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImportStreams}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            {importing ? 'Импорт...' : 'Импорт расписания (Excel)'}
          </button>
        </div>
      </div>

      <div className="bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900">Создать новый поток</h3>
        <form onSubmit={handleCreateStream} className="mt-5 sm:flex sm:items-center">
          <div className="w-full sm:max-w-xs">
            <input
              type="text"
              name="streamName"
              id="streamName"
              className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              placeholder="Например: Поток 45"
              value={newStreamName}
              onChange={(e) => setNewStreamName(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="mt-3 w-full inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
          >
            Добавить
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 bg-white shadow rounded-lg overflow-hidden flex flex-col">
          {selectedForDeletion.size > 0 && (
            <div className="bg-indigo-50 p-3 border-b border-indigo-100 flex justify-between items-center">
              <span className="text-sm text-indigo-700 font-medium">Выбрано: {selectedForDeletion.size}</span>
              <button
                onClick={() => setDeleteConfirm({ type: 'bulk' })}
                className="text-sm bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1 rounded-md font-medium"
              >
                Удалить
              </button>
            </div>
          )}
          <ul className="divide-y divide-gray-200 overflow-y-auto max-h-[600px]">
            {streams.map((stream) => (
              <li 
                key={stream.id} 
                className={`p-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between ${selectedStream?.id === stream.id ? 'bg-indigo-50' : ''}`}
                onClick={() => setSelectedStream(stream)}
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={selectedForDeletion.has(stream.id)}
                    onChange={() => {}}
                    onClick={(e) => toggleSelection(stream.id, e)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{stream.name}</p>
                    <p className="text-xs text-gray-500">Создан: {format(new Date(stream.createdAt), 'dd.MM.yyyy')}</p>
                    {calculateStreamEndDate(stream) && (
                      <p className="text-xs text-indigo-600 mt-1">
                        Окончание: {format(new Date(calculateStreamEndDate(stream)!), 'dd.MM.yyyy')}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm({ type: 'single', id: stream.id });
                  }}
                  className="text-gray-400 hover:text-red-500 p-1"
                  title="Удалить поток"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {streams.length === 0 && (
              <li className="p-4 text-sm text-gray-500">Потоков пока нет</li>
            )}
          </ul>
        </div>

        <div className="col-span-2 bg-white shadow rounded-lg p-6">
          {selectedStream ? (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Настройка дат открытия блоков: {selectedStream.name}</h3>
                {calculateStreamEndDate(selectedStream) && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
                    Окончание потока: {format(new Date(calculateStreamEndDate(selectedStream)!), 'dd.MM.yyyy')}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4">
                {Array.from({ length: 13 }, (_, i) => i + 1).map((blockNum) => {
                  let extrapolatedDate = '';
                  if (!selectedStream.blockDates?.[blockNum] && selectedStream.blockDates?.[1]) {
                    const startDate = new Date(selectedStream.blockDates[1]);
                    startDate.setDate(startDate.getDate() + (blockNum - 1) * 7);
                    extrapolatedDate = startDate.toISOString().split('T')[0];
                  }

                  return (
                  <div key={blockNum} className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm font-medium text-gray-700">Блок {blockNum}</span>
                    <div className="flex items-center space-x-3">
                      {extrapolatedDate && (
                        <span className="text-xs text-gray-400" title="Дата рассчитана автоматически (+7 дней)">
                          (авто: {format(new Date(extrapolatedDate), 'dd.MM.yyyy')})
                        </span>
                      )}
                      <input
                        type="date"
                        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm border-gray-300 rounded-md p-1 border"
                        value={selectedStream.blockDates?.[blockNum] || ''}
                        onChange={(e) => handleUpdateBlockDate(selectedStream.id, blockNum, e.target.value)}
                      />
                    </div>
                  </div>
                )})}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-10">
              Выберите поток слева для настройки дат блоков
            </div>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Подтверждение удаления</h3>
            <p className="text-sm text-gray-500 mb-6">
              {deleteConfirm.type === 'bulk' 
                ? `Вы уверены, что хотите удалить ${selectedForDeletion.size} потоков? Это действие нельзя отменить.`
                : 'Вы уверены, что хотите удалить этот поток? Это действие нельзя отменить.'}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === 'bulk') {
                    executeBulkDelete();
                  } else if (deleteConfirm.id) {
                    executeSingleDelete(deleteConfirm.id);
                  }
                  setDeleteConfirm(null);
                }}
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
                <div className="h-6 w-6 text-red-600 flex items-center justify-center font-bold text-xl">!</div>
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
                <div className="h-6 w-6 text-green-600 flex items-center justify-center font-bold text-xl">✓</div>
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
