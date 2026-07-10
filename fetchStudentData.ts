import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const studentId = process.argv[2] || 'MTpRQ1FLjTp6XIMRq8EA';
  console.log(`Searching for student ID: ${studentId}`);
  
  const studentSnap = await getDoc(doc(db, 'students', studentId));
  console.log('Student exists in students collection:', studentSnap.exists());
  if (studentSnap.exists()) {
    console.log('Student data:', studentSnap.data());
  }

  const actionsQuery = query(collection(db, 'actions'), where('studentId', '==', studentId));
  const actionsSnap = await getDocs(actionsQuery);
  console.log(`Found ${actionsSnap.size} actions for this student.`);
  actionsSnap.forEach(d => console.log('Action:', d.id, d.data()));

  const progressQuery = query(collection(db, 'progress'), where('studentId', '==', studentId));
  const progressSnap = await getDocs(progressQuery);
  console.log(`Found ${progressSnap.size} progress records for this student.`);
  progressSnap.forEach(d => console.log('Progress:', d.id, d.data()));

  const auditQuery = query(collection(db, 'audit_logs'), where('documentId', '==', studentId));
  const auditSnap = await getDocs(auditQuery);
  console.log(`Found ${auditSnap.size} audit logs for this student.`);
  auditSnap.forEach(d => console.log('Audit Log:', d.id, d.data()));
  
  process.exit(0);
}

run().catch(console.error);
