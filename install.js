const installDialog = document.getElementById('install-dialog');
const installButton = document.getElementById('install-app');
let installPrompt;
function installed() { return navigator.standalone || window.matchMedia('(display-mode: standalone)').matches; }
function syncInstall() {
  document.getElementById('app-install-status').textContent = installed() ? 'Installed · Ready when you are.' : 'Your weather. On any screen.';
  installButton.textContent = installed() ? 'Installation help' : 'Install TrueCast ↗';
  document.getElementById('install-caption').textContent = installed() ? 'You’re using the installed app. Updates arrive from the same site.' : 'No account needed. Your saved places stay on this device.';
}
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('appinstalled', () => { installPrompt = null; syncInstall(); });
installButton.addEventListener('click', async () => {
  if (installPrompt) {
    const prompt = installPrompt; installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; } catch { installDialog.showModal(); }
  } else installDialog.showModal();
});
document.getElementById('close-install').addEventListener('click', () => installDialog.close());
installDialog.addEventListener('click', event => { if (event.target === installDialog) installDialog.close(); });
window.matchMedia('(display-mode: standalone)').addEventListener('change', syncInstall);
syncInstall();
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'}).catch(() => {}); });
}
document.getElementById('check-updates').addEventListener('click', async event => {
  const button = event.currentTarget, status = document.getElementById('update-status');
  if (!navigator.onLine) { status.textContent = 'Reconnect to check for an app update.'; return; }
  button.disabled = true; status.textContent = 'Checking…';
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.update();
    location.reload();
  } catch { status.textContent = 'Could not check for updates. Please try again.'; button.disabled = false; }
});
