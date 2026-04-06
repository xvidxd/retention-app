import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot, collection, query, where, orderBy, addDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Student, ProgressHistory, Action, Stream } from '../lib/types';
import { handleFirestoreError, OperationType, calculateStudentMetrics } from '../lib/utils';
import { format } from 'date-fns';
import { Check, X } from 'lucide-react';

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [progress, setProgress] = useState<ProgressHistory[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);

  // Action form state
  const [actionType, setActionType] = useState('Звонок');
  const [actionResult, setActionResult] = useState('Связался');
  const [actionComment, setActionComment] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');

  useEffect(() => {
    if (!id || !auth.currentUser) return;

    const unsubStudent = onSnapshot(doc(db, 'students', id), (docSnap) => {
      if (docSnap.exists()) {
        const studentData = { id: docSnap.id, ...docSnap.data() } as Student;
        setStudent(studentData);
        
        // Fetch stream for this student
        if (studentData.streamId) {
          onSnapshot(doc(db, 'streams', studentData.streamId), (streamSnap) => {
            if (streamSnap.exists()) {
              setStream({ id: streamSnap.id, ...streamSnap.data() } as Stream);
            }
          }, (error) => console.warn("Error fetching stream:", error));
        }
      }
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, `students/${id}`, auth));

    const qProgress = query(collection(db, 'progress'), where('studentId', '==', id), orderBy('date', 'desc'));
    const unsubProgress = onSnapshot(qProgress, (snapshot) => {
      setProgress(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ProgressHistory)));
    }, (error) => {
      // Ignore index errors for prototype, or just remove orderBy if it fails
      console.warn("Progress query error (might need index):", error);
    });

    const qActions = query(collection(db, 'actions'), where('studentId', '==', id), orderBy('date', 'desc'));
    const unsubActions = onSnapshot(qActions, (snapshot) => {
      setActions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Action)));
    }, (error) => {
      console.warn("Actions query error (might need index):", error);
    });

    return () => {
      unsubStudent();
      unsubProgress();
      unsubActions();
    };
  }, [id]);

  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !auth.currentUser) return;

    try {
      await addDoc(collection(db, 'actions'), {
        studentId: id,
        date: new Date().toISOString(),
        type: actionType,
        result: actionResult,
        comment: actionComment,
        nextActionDate: nextActionDate || null,
        managerId: auth.currentUser.uid,
      });

      setActionComment('');
      setNextActionDate('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'actions', auth);
    }
  };

  const handleToggleActionStatus = async (actionId: string, isCompleted: boolean | null) => {
    try {
      await updateDoc(doc(db, 'actions', actionId), {
        isCompleted: isCompleted === null ? deleteField() : isCompleted
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `actions/${actionId}`, auth);
    }
  };

  if (loading) return <div>Загрузка профиля...</div>;
  if (!student) return <div>Студент не найден</div>;

  const metrics = calculateStudentMetrics(student.currentBlock, stream || undefined);
  const dynamicStudent = { ...student, ...metrics };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">Профиль студента</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">{dynamicStudent.email}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            dynamicStudent.status === 'critical' ? 'bg-red-100 text-red-800' :
            dynamicStudent.status === 'lagging' ? 'bg-yellow-100 text-yellow-800' :
            dynamicStudent.status === 'not_started' ? 'bg-gray-100 text-gray-800' :
            'bg-green-100 text-green-800'
          }`}>
            {dynamicStudent.status === 'critical' ? 'Критично' :
             dynamicStudent.status === 'lagging' ? 'Отстает' :
             dynamicStudent.status === 'not_started' ? 'Не стартовал' : 'В норме'}
          </span>
        </div>
        <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-gray-200">
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Поток</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{dynamicStudent.streamName}</dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Текущий блок</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{dynamicStudent.currentBlock}</dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Ожидаемый блок</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{dynamicStudent.expectedBlock}</dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Отставание (дельта)</dt>
              <dd className={`mt-1 text-sm font-bold sm:mt-0 sm:col-span-2 ${dynamicStudent.delta && dynamicStudent.delta < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {dynamicStudent.delta}
              </dd>
            </div>
            {dynamicStudent.noMovementCount && dynamicStudent.noMovementCount > 1 && (
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 bg-red-50">
                <dt className="text-sm font-medium text-red-800">Внимание</dt>
                <dd className="mt-1 text-sm text-red-800 sm:mt-0 sm:col-span-2">
                  Нет движения {dynamicStudent.noMovementCount} загрузок подряд
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actions Form & History */}
        <div className="space-y-6">
          <div className="bg-white shadow sm:rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Добавить действие</h3>
            <form onSubmit={handleAddAction} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Тип</label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                  >
                    <option>Звонок</option>
                    <option>Сообщение</option>
                    <option>Email</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Результат</label>
                  <select
                    value={actionResult}
                    onChange={(e) => setActionResult(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                  >
                    <option>Связался</option>
                    <option>Не дозвонился</option>
                    <option>Обещал догнать</option>
                    <option>Тех. проблема</option>
                    <option>Перенос потока</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Комментарий</label>
                <textarea
                  rows={3}
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md mt-1 p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Следующее действие (дата)</label>
                <input
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => setNextActionDate(e.target.value)}
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md mt-1 p-2"
                />
              </div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Сохранить
              </button>
            </form>
          </div>

          <div className="bg-white shadow sm:rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">История действий</h3>
            <div className="flow-root">
              <ul className="-mb-8">
                {actions.map((action, actionIdx) => (
                  <li key={action.id}>
                    <div className="relative pb-8">
                      {actionIdx !== actions.length - 1 ? (
                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                      ) : null}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center ring-8 ring-white">
                            <span className="text-white text-xs">{action.type[0]}</span>
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-gray-500">
                              {action.type} <span className="font-medium text-gray-900">{action.result}</span>
                            </p>
                            {action.comment && <p className="mt-1 text-sm text-gray-700">{action.comment}</p>}
                            {action.nextActionDate && (
                              <p className="mt-1 text-xs text-indigo-600 font-medium">
                                Следующее действие: {format(new Date(action.nextActionDate), 'dd.MM.yyyy')}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500 flex flex-col items-end space-y-2">
                            <time dateTime={action.date}>{format(new Date(action.date), 'dd.MM.yyyy HH:mm')}</time>
                            <div className="flex space-x-2">
                              {action.isCompleted !== false && (
                                <button
                                  onClick={() => action.isCompleted === undefined && handleToggleActionStatus(action.id, true)}
                                  disabled={action.isCompleted !== undefined}
                                  className={`p-1 rounded-full ${action.isCompleted === true ? 'bg-green-100 text-green-600 cursor-default' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                                  title="Выполнено"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                              {action.isCompleted !== true && (
                                <button
                                  onClick={() => action.isCompleted === undefined && handleToggleActionStatus(action.id, false)}
                                  disabled={action.isCompleted !== undefined}
                                  className={`p-1 rounded-full ${action.isCompleted === false ? 'bg-red-100 text-red-600 cursor-default' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                                  title="Не выполнено"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {actions.length === 0 && <p className="text-sm text-gray-500">Действий пока нет</p>}
              </ul>
            </div>
          </div>
        </div>

        {/* Progress History */}
        <div className="bg-white shadow sm:rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">История прогресса</h3>
          <div className="flow-root">
            <ul className="-mb-8">
              {progress.map((item, itemIdx) => (
                <li key={item.id}>
                  <div className="relative pb-8">
                    {itemIdx !== progress.length - 1 ? (
                      <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                    ) : null}
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center ring-8 ring-white">
                          <span className="text-white text-xs font-bold">{item.block}</span>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                        <div>
                          <p className="text-sm text-gray-500">
                            Зафиксирован блок <span className="font-medium text-gray-900">{item.block}</span>
                          </p>
                        </div>
                        <div className="text-right text-sm whitespace-nowrap text-gray-500">
                          <time dateTime={item.date}>{format(new Date(item.date), 'dd.MM.yyyy HH:mm')}</time>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {progress.length === 0 && <p className="text-sm text-gray-500">Истории прогресса пока нет</p>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
