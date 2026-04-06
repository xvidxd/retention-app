export interface Stream {
  id: string;
  name: string;
  blockDates: Record<number, string>; // block number -> ISO date string
  createdAt: string;
}

export type StudentStatus = 'not_started' | 'normal' | 'lagging' | 'critical';

export interface Student {
  id: string;
  email: string;
  streamId: string;
  streamName?: string;
  currentBlock: number;
  expectedBlock?: number;
  delta?: number;
  status: StudentStatus;
  lastActionDate?: string;
  nextActionDate?: string;
  noMovementCount?: number;
  updatedAt: string;
}

export interface ImportRecord {
  id: string;
  date: string;
  fileName: string;
  totalStudents: number;
}

export interface ProgressHistory {
  id: string;
  studentId: string;
  importId: string;
  date: string;
  block: number;
}

export interface Action {
  id: string;
  studentId: string;
  date: string;
  type: string;
  result: string;
  comment?: string;
  nextActionDate?: string;
  managerId: string;
  managerName?: string;
  isCompleted?: boolean;
}
