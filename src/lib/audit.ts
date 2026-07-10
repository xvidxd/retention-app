import { addDoc, collection } from 'firebase/firestore';
import { db, auth } from '../firebase';

export type AuditAction = 'CREATE_STUDENT' | 'UPDATE_STUDENT' | 'DELETE_STUDENT' | 'IMPORT_STUDENTS' | 'UPDATE_STREAM';

export async function logAudit(
  action: AuditAction,
  documentId: string | null,
  details: any
) {
  if (!auth.currentUser) return;
  
  try {
    await addDoc(collection(db, 'audit_logs'), {
      action,
      documentId,
      details,
      userEmail: auth.currentUser.email,
      userId: auth.currentUser.uid,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Failed to log audit event', error);
  }
}
