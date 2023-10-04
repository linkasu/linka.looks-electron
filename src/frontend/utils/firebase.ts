import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCOZgNQocMjLYRlknx2iqV04a2znPHSXRM",
  authDomain: "linka-looks.firebaseapp.com",
  projectId: "linka-looks",
  storageBucket: "linka-looks.appspot.com",
  messagingSenderId: "382680184461",
  appId: "1:382680184461:web:de6cc2f778cf82eb5714c4",
  measurementId: "G-97FNW69B7T"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAnalytics = getAnalytics(firebaseApp);
export const firebaseAuth = getAuth(firebaseApp);
