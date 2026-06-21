/**
 * app.js — tiện ích dùng chung cho toàn bộ frontend (toast thông báo).
 */
(function () {
  let timeoutId = null;

  window.showToast = function (message, duration = 2600) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('is-visible');

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, duration);
  };
})();
