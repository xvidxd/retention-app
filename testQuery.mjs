import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import * as fs from 'fs';

async function run() {
  const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  const q = query(collection(db, 'actions'), where('nextActionDate', '>', ''));
  try {
    const snap = await getDocs(q);
    console.log(`Found ${snap.size} actions with nextActionDate > ''`);
  } catch (error) {
    console.error("Query failed:", error);
  }
  process.exit(0);
}
run().catch(console.error);
