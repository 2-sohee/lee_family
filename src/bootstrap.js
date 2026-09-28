import { firebaseReady } from "./firebase.js";
import { photoLimits, readPhoto } from "./photoStorage.js";

// Keep the static UI independent while exposing configuration status to a
// future login/persistence integration.
document.documentElement.dataset.firebase = firebaseReady
  ? "configured"
  : "not-configured";

// Keep local selection behind a replaceable seam for a future Storage adapter.
window.familyPhotoStorage = Object.freeze({ photoLimits, readPhoto });
