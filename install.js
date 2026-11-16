const installDialog = document.getElementById('install-dialog');
document.getElementById('install-app').addEventListener('click', () => installDialog.showModal());
document.getElementById('close-install').addEventListener('click', () => installDialog.close());
installDialog.addEventListener('click', event => { if (event.target === installDialog) installDialog.close(); });
if (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
  document.getElementById('install-app').hidden = true;
}
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'}).catch(() => {
      // Online use continues if the browser declines offline installation.
    });
  });
}
