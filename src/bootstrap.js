import { firebaseReady } from "./firebase.js";

// Keep the static UI independent while exposing configuration status to a
// future login/persistence integration.
document.documentElement.dataset.firebase = firebaseReady
  ? "configured"
  : "not-configured";
