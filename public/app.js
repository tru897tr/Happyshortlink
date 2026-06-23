/**
 * app.js — tiện ích dùng chung cho toàn bộ frontend (toast thông báo
 * + trình phát hiện AdBlock).
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

/**
 * ----------------------------------------------------------------
 * AdBlock Detector
 * ----------------------------------------------------------------
 * Kỹ thuật: tạo một thẻ <div> với class/id thường bị các bộ lọc
 * quảng cáo (EasyList...) chặn (ví dụ "ads", "ad-banner",
 * "adsbygoogle"), gắn vào DOM, sau đó kiểm tra xem trình duyệt có
 * ẩn/xoá nó hay không (offsetParent null, offsetHeight 0, hoặc
 * bị display:none do CSS injected từ extension chặn quảng cáo).
 *
 * Nếu phát hiện → hiện overlay toàn trang yêu cầu tắt AdBlock cho
 * trang này rồi tải lại. Không có lựa chọn "bỏ qua".
 * ----------------------------------------------------------------
 */
(function () {
  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'adblockOverlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="adblock-box">
        <div class="adblock-icon">🛡️</div>
        <h2>Vui lòng tắt trình chặn quảng cáo</h2>
        <p>Chúng tôi phát hiện bạn đang dùng trình chặn quảng cáo (AdBlock/uBlock...).
        Happyshortlink hoạt động miễn phí nhờ quảng cáo — vui lòng tắt tiện ích chặn quảng cáo
        cho trang này, sau đó tải lại trang để tiếp tục.</p>
        <button type="button" class="btn btn-primary" id="adblockReloadBtn">Tôi đã tắt — Tải lại trang</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const reloadBtn = overlay.querySelector('#adblockReloadBtn');
    reloadBtn.addEventListener('click', () => window.location.reload());
  }

  function detectAdblock(callback) {
    const bait = document.createElement('div');
    bait.className = 'ads ad-banner adsbygoogle advertisement adsbox doubleclick ad-slot';
    bait.setAttribute('aria-hidden', 'true');
    bait.style.position = 'absolute';
    bait.style.left = '-9999px';
    bait.style.top = '-9999px';
    bait.style.width = '1px';
    bait.style.height = '1px';
    document.body.appendChild(bait);

    // Một số bộ lọc cần một nhịp để CSS injected có hiệu lực.
    window.setTimeout(() => {
      const blocked =
        bait.offsetParent === null ||
        bait.offsetHeight === 0 ||
        bait.offsetWidth === 0 ||
        window.getComputedStyle(bait).display === 'none' ||
        window.getComputedStyle(bait).visibility === 'hidden';

      bait.remove();
      callback(blocked);
    }, 120);
  }

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    detectAdblock((isBlocked) => {
      if (isBlocked) {
        buildOverlay();
      }
    });
  }

  init();
})();
