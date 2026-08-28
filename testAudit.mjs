import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

async function run() {
  const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  console.log("Checking audit_logs access");
  try {
    const snap = await getDocs(collection(db, 'audit_logs'));
    console.log("Docs found:", snap.size);
  } catch (error) {
    console.error("Query failed:", error);
  }
  process.exit(0);
}
run().catch(console.error);
