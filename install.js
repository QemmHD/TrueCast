const installDialog = document.getElementById("install-dialog");
const installButton = document.getElementById("install-app");
let installPrompt;
function installed() {
  return (
    navigator.standalone ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}
function syncInstall() {
  document.getElementById("app-install-status").textContent = installed()
    ? "Installed · Ready when you are."
    : "Your weather. On any screen.";
  installButton.textContent = installed()
    ? "Installation help"
    : "Install TrueCast";
  document.getElementById("install-caption").textContent = installed()
    ? "You’re using the installed app. Updates arrive from the same site."
    : "No account needed. Your saved places stay on this device.";
}
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  syncInstall();
});
installButton.addEventListener("click", async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      installDialog.showModal();
    }
  } else installDialog.showModal();
});
document
  .getElementById("close-install")
  .addEventListener("click", () => installDialog.close());
installDialog.addEventListener("click", (event) => {
  if (event.target === installDialog) installDialog.close();
});
window
  .matchMedia("(display-mode: standalone)")
  .addEventListener("change", syncInstall);
syncInstall();
let workerRegistration;
let applyingUpdate = false;
function updateReady(registration, worker) {
  workerRegistration = registration;
  if (
    navigator.serviceWorker.controller &&
    registration.active &&
    (registration.waiting || worker?.state === "installed")
  )
    document.getElementById("update-status").textContent =
      "An app update is ready. Tap Check for updates to apply it.";
}
function applyUpdate(registration, candidate) {
  const waiting =
    registration.waiting ||
    (candidate?.state === "installed" ? candidate : null);
  if (!waiting) return false;
  applyingUpdate = true;
  document.getElementById("update-status").textContent = "Applying update…";
  waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  return true;
}
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (applyingUpdate) location.reload();
  });
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none",
      });
      workerRegistration = registration;
      // A fully downloaded update from the last visit can be applied at startup.
      if (registration.waiting) applyUpdate(registration);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") updateReady(registration, worker);
        });
      });
    } catch {}
  });
}
document
  .getElementById("check-updates")
  .addEventListener("click", async (event) => {
    const button = event.currentTarget,
      status = document.getElementById("update-status");
    if (!navigator.onLine) {
      status.textContent = "Reconnect to check for an app update.";
      return;
    }
    button.disabled = true;
    status.textContent = "Checking…";
    try {
      const registration =
        workerRegistration ||
        (await navigator.serviceWorker?.getRegistration());
      if (!registration) {
        status.textContent =
          "No app update service is registered in this browser.";
        return;
      }
      if (applyUpdate(registration)) return;
      await registration.update();
      const candidate = registration.installing;
      if (candidate) {
        const worker = candidate;
        await new Promise((resolve, reject) => {
          const finish = () => {
            if (worker.state === "installed" || worker.state === "activated")
              resolve();
            else if (worker.state === "redundant")
              reject(new Error("Update incomplete"));
          };
          worker.addEventListener("statechange", finish);
          finish();
        });
      }
      if (!applyUpdate(registration, candidate))
        status.textContent =
          "TrueCast is up to date. Weather refreshes independently.";
    } catch {
      status.textContent =
        "Could not complete the update. Your current app is still available.";
    } finally {
      button.disabled = false;
    }
  });
