// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";
import { persistentLocalCache,
    initializeFirestore,
 } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAeYCIBxrOMObicdpLB1n92_pFDqo208u0",
    authDomain: "mapmysteps-df289.firebaseapp.com",
    projectId: "mapmysteps-df289",
    storageBucket: "mapmysteps-df289.firebasestorage.app",
    messagingSenderId: "90850298339",
    appId: "1:90850298339:web:06cb1322bc0c5a98dbf8d6",
    measurementId: "G-6XTQ6H96GV"
};

let app;
let db;
let auth;

try {
    app = initializeApp(firebaseConfig);
    db = initializeFirestore(app, persistentLocalCache());
    auth = getAuth(app);
    console.log("Firebase initialized successfully");
    console.log("Firestore instance:", db);
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

export { app, db, auth };