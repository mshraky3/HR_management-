import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const defaultFirebaseConfig = {
    apiKey: 'AIzaSyDO7_fON7wnEOUCO1BAWO1MBt_xz97eF6M',
    authDomain: 'hr-auth-fbcdf.firebaseapp.com',
    projectId: 'hr-auth-fbcdf',
    storageBucket: 'hr-auth-fbcdf.firebasestorage.app',
    messagingSenderId: '812559295635',
    appId: '1:812559295635:web:63fa926b013fce95e55966',
};

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
    messagingSenderId:
        import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId,
};

if (import.meta.env.DEV) {
    const requiredFirebaseEnv = [
        'VITE_FIREBASE_API_KEY',
        'VITE_FIREBASE_AUTH_DOMAIN',
        'VITE_FIREBASE_PROJECT_ID',
        'VITE_FIREBASE_STORAGE_BUCKET',
        'VITE_FIREBASE_MESSAGING_SENDER_ID',
        'VITE_FIREBASE_APP_ID',
    ];
    const missingFirebaseEnv = requiredFirebaseEnv.filter((key) => !import.meta.env[key]);
    if (missingFirebaseEnv.length > 0) {
        console.warn(
            `Firebase env vars are missing (${missingFirebaseEnv.join(', ')}). Using fallback config.`
        );
    }
}

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
