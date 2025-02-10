import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';

// Path to both service account keys
const serviceAccountPath = '/etc/secrets/serviceAccountKey.json';
const serviceAccount2Path = '/etc/secrets/serviceAccountKey2.json';
const serviceAccount3Path = '/etc/secrets/serviceAccountKey3.json';

// Read and parse both service account JSON files
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
const serviceAccount2 = JSON.parse(readFileSync(serviceAccount2Path, 'utf8'));
const serviceAccount3 = JSON.parse(readFileSync(serviceAccount3Path, 'utf8'));

// Initialize first Firebase app
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount3),
        }, 'app1'); // Name the first app instance
        console.log('First Firebase Admin successfully initialized!');
    } catch (error) {
        console.error('First Firebase Admin initialization error:', error);
    }
}

// Initialize second Firebase app
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount2),
    }, 'app2'); // Name the second app instance
    console.log('Second Firebase Admin successfully initialized!');
} catch (error) {
    console.error('Second Firebase Admin initialization error:', error);
}

// Initialize third Firebase app
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    }, 'app3'); // Name the second app instance
    console.log('Third Firebase Admin successfully initialized!');
} catch (error) {
    console.error('Third Firebase Admin initialization error:', error);
}

// Export both Firestore instances
export const firestore3 = admin.app('app1').firestore();
export const firestore2 = admin.app('app2').firestore();
export const firestore = admin.app('app3').firestore();
export const storage = admin.app('app1').storage();

