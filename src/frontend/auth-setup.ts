import store from "./store";
import { onAuthStateChanged, setPersistence, browserLocalPersistence, inMemoryPersistence } from "firebase/auth";
import { firebaseAuth } from "./utils/firebase";
// navigator.storage.persist()


setPersistence(firebaseAuth, browserLocalPersistence);
onAuthStateChanged(firebaseAuth, (user) => {
  console.log("fb user", user);
  store.commit("user", user);

});
