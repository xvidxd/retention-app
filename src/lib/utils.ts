import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Stream } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, auth: any) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function calculateStudentMetrics(currentBlock: number, stream?: Stream) {
  let expectedBlock = 1;
  const today = new Date().toISOString().split('T')[0];
  
  if (stream && stream.blockDates) {
    const startDateStr = stream.blockDates[1];

    for (let i = 13; i >= 1; i--) {
      let blockDateStr = stream.blockDates[i];

      // Extrapolate date if not explicitly set, but block 1 is set
      if ((!blockDateStr || blockDateStr.trim() === '') && startDateStr && startDateStr.trim() !== '') {
        const startDate = new Date(startDateStr);
        startDate.setDate(startDate.getDate() + (i - 1) * 7);
        blockDateStr = startDate.toISOString().split('T')[0];
      }

      if (blockDateStr && blockDateStr.trim() !== '' && blockDateStr <= today) {
        expectedBlock = i;
        break;
      }
    }
  }

  const delta = currentBlock - expectedBlock;
  let status: 'normal' | 'lagging' | 'critical' | 'not_started' = 'normal';

  if (currentBlock === 0) {
    status = 'not_started';
  } else if (delta >= -1) {
    status = 'normal';
  } else if (delta >= -4) {
    status = 'lagging';
  } else {
    status = 'critical';
  }

  return { expectedBlock, delta, status };
}

export function calculateStreamEndDate(stream?: Stream): string | null {
  if (!stream || !stream.blockDates) return null;
  
  let lastBlockDateStr = stream.blockDates[13];
  
  // Extrapolate if not set but block 1 is set
  if ((!lastBlockDateStr || lastBlockDateStr.trim() === '') && stream.blockDates[1] && stream.blockDates[1].trim() !== '') {
    const startDate = new Date(stream.blockDates[1]);
    startDate.setDate(startDate.getDate() + (13 - 1) * 7);
    lastBlockDateStr = startDate.toISOString().split('T')[0];
  }

  if (lastBlockDateStr && lastBlockDateStr.trim() !== '') {
    const endDate = new Date(lastBlockDateStr);
    endDate.setDate(endDate.getDate() + 28); // 4 weeks (28 days)
    return endDate.toISOString().split('T')[0];
  }
  
  return null;
}
