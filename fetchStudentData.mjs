import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import * as fs from 'fs';

async function run() {
  const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  const studentId = 'MTpRQ1FLjTp6XIMRq8EA';
  
  let out = '';
  out += `Searching for student ID: ${studentId}\n`;
  
  const studentSnap = await getDoc(doc(db, 'students', studentId));
  out += `Student exists in students collection: ${studentSnap.exists()}\n`;
  if (studentSnap.exists()) {
    out += `Student data: ${JSON.stringify(studentSnap.data())}\n`;
  }

  const actionsQuery = query(collection(db, 'actions'), where('studentId', '==', studentId));
  const actionsSnap = await getDocs(actionsQuery);
  out += `Found ${actionsSnap.size} actions for this student.\n`;
  actionsSnap.forEach(d => { out += `Action: ${d.id} ${JSON.stringify(d.data())}\n`; });

  fs.writeFileSync('output.txt', out);
  console.log('Done');
  process.exit(0);
}

run().catch(console.error);
