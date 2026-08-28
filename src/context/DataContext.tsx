import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Student, Stream } from '../lib/types';
import { handleFirestoreError, OperationType } from '../lib/utils';

interface DataContextType {
  students: Student[];
  streams: Stream[];
  loading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    let studentsLoaded = false;
    let streamsLoaded = false;

    const checkLoading = () => {
      if (studentsLoaded && streamsLoaded) {
        setLoading(false);
      }
    };

    // 1 listener for students for the entire app lifecycle
    const unsubStudents = onSnapshot(query(collection(db, 'students')), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      studentsLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'students', auth);
      studentsLoaded = true;
      checkLoading();
    });

    // 1 listener for streams for the entire app lifecycle
    const unsubStreams = onSnapshot(query(collection(db, 'streams')), (snapshot) => {
      setStreams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stream)));
      streamsLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'streams', auth);
      streamsLoaded = true;
      checkLoading();
    });

    return () => {
      unsubStudents();
      unsubStreams();
    };
  }, []);

  return (
    <DataContext.Provider value={{ students, streams, loading }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
