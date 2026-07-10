import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Student } from '../lib/types';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function GlobalSearch() {
  const [queryText, setQueryText] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [results, setResults] = useState<Student[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;
    const qStudents = query(collection(db, 'students'));
    const unsubscribe = onSnapshot(qStudents, (snapshot) => {
      const studentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(studentsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'students', auth);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (queryText.trim().length === 0) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const searchTerm = queryText.toLowerCase().trim();
    const filtered = students.filter(student => 
      (student.email && student.email.toLowerCase().includes(searchTerm)) ||
      (student.phone && student.phone.toLowerCase().includes(searchTerm))
    );
    
    setResults(filtered.slice(0, 5)); // show up to 5 results
    setIsOpen(true);
  }, [queryText, students]);

  const handleSelect = (studentId: string) => {
    setQueryText('');
    setIsOpen(false);
    navigate(`/students/${studentId}`);
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
          placeholder="Поиск по email или телефону..."
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          onFocus={() => {
            if (queryText.trim().length > 0) setIsOpen(true);
          }}
        />
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md border border-gray-200 py-1">
          <ul className="max-h-60 rounded-md py-1 text-base leading-6 overflow-auto focus:outline-none sm:text-sm sm:leading-5">
            {results.map((student) => (
              <li
                key={student.id}
                className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-50 text-gray-900"
                onClick={() => handleSelect(student.id)}
              >
                <div className="flex flex-col">
                  <span className="font-medium truncate">{student.email}</span>
                  <span className="text-gray-500 text-xs truncate">{student.phone || 'Нет телефона'}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isOpen && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md border border-gray-200 py-3 px-4 text-sm text-gray-500 text-center">
          Ничего не найдено
        </div>
      )}
    </div>
  );
}
