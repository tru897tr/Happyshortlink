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
 * AdBlock Detector — bắt buộc, kiểm tra liên tục, chặn cứng
 * ----------------------------------------------------------------
 * Dùng NHIỀU kỹ thuật song song để khó bị qua mặt hơn một bait đơn:
 *
 *  1) Bait DOM: tạo nhiều thẻ với class/id quen thuộc trong các
 *     danh sách lọc (EasyList...) và kiểm tra trình duyệt có ẩn nó
 *     không (offsetHeight/offsetParent/display/visibility).
 *  2) Bait network: thử tải một file có tên gợi adscript ở dạng
 *     request thật (fetch) — nhiều AdBlock chặn ở tầng network nên
 *     request sẽ bị "failed"/"aborted", phân biệt được với lỗi 404
 *     thông thường.
 *
 * Nếu MỘT TRONG HAI kỹ thuật phát hiện chặn → coi như có AdBlock.
 *
 * Hành vi khi phát hiện:
 *  - Hiện overlay toàn trang, KHÔNG có cách đóng ngoài việc tắt
 *    AdBlock và tải lại trang.
 *  - Khoá scroll & tương tác của toàn bộ nội dung phía sau overlay
 *    (body nhận class "adblock-lock": overflow hidden + các phần tử
 *    khác bị "inert" qua thuộc tính aria/tabindex).
 *  - Tiếp tục kiểm tra định kỳ (mỗi vài giây) ngay cả sau khi đã
 *    pass lần đầu — nếu người dùng bật AdBlock trở lại giữa lúc
 *    đang đọc trang, overlay vẫn xuất hiện.
 * ----------------------------------------------------------------
 */
(function () {
  let overlayEl = null;
  let lockedScrollY = 0;

  function lockPage() {
    if (document.body.classList.contains('adblock-locked')) return;
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('adblock-locked');
    document.body.style.top = `-${lockedScrollY}px`;

    // Ngăn focus/tab vào nội dung phía sau overlay.
    document.querySelectorAll('body > *:not(#adblockOverlay)').forEach((el) => {
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-adblock-inert', 'true');
    });
  }

  function unlockPage() {
    document.body.classList.remove('adblock-locked');
    document.body.style.top = '';
    window.scrollTo(0, lockedScrollY);

    document.querySelectorAll('[data-adblock-inert]').forEach((el) => {
      el.removeAttribute('aria-hidden');
      el.removeAttribute('data-adblock-inert');
    });
  }

  function buildOverlay() {
    if (overlayEl) return overlayEl;
    const overlay = document.createElement('div');
    overlay.id = 'adblockOverlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="adblock-box">
        <div class="adblock-icon">🛡️</div>
        <h2>Vui lòng tắt trình chặn quảng cáo</h2>
        <p>Chúng tôi phát hiện trình duyệt của bạn đang chặn quảng cáo (AdBlock/uBlock/Brave Shields...).
        Happyshortlink hoạt động miễn phí nhờ quảng cáo. Vui lòng tắt hoàn toàn tiện ích chặn quảng cáo
        cho trang này, sau đó bấm nút dưới đây để tiếp tục.</p>
        <button type="button" class="btn btn-primary" id="adblockReloadBtn">Tôi đã tắt — Tải lại trang</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#adblockReloadBtn').addEventListener('click', () => window.location.reload());
    overlayEl = overlay;
    return overlay;
  }

  function showOverlay() {
    buildOverlay();
    lockPage();
  }

  function hideOverlayIfClear() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
      unlockPage();
    }
  }

  /** Kỹ thuật 1: nhiều bait DOM cùng lúc, tên class phổ biến trong EasyList. */
  function detectViaDomBait() {
    const baitClasses = [
      'ads ad-banner adsbygoogle advertisement adsbox doubleclick ad-slot',
      'pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links',
      'ad-placement banner-ad google-ad-banner',
    ];

    let blockedCount = 0;
    const baits = baitClasses.map((cls) => {
      const bait = document.createElement('div');
      bait.className = cls;
      bait.setAttribute('aria-hidden', 'true');
      bait.style.position = 'absolute';
      bait.style.left = '-9999px';
      bait.style.top = '-9999px';
      bait.style.width = '2px';
      bait.style.height = '2px';
      document.body.appendChild(bait);
      return bait;
    });

    return new Promise((resolve) => {
      window.setTimeout(() => {
        baits.forEach((bait) => {
          const style = window.getComputedStyle(bait);
          const blocked =
            bait.offsetParent === null ||
            bait.offsetHeight === 0 ||
            bait.offsetWidth === 0 ||
            style.display === 'none' ||
            style.visibility === 'hidden';
          if (blocked) blockedCount += 1;
          bait.remove();
        });
        // Coi như bị chặn nếu BẤT KỲ bait nào bị ẩn.
        resolve(blockedCount > 0);
      }, 150);
    });
  }

  /** Kỹ thuật 2: thử fetch một resource có tên gợi quảng cáo. */
  function detectViaNetworkBait() {
    const baitUrl = '/static/ads/adsbygoogle-ad-banner.js?bait=' + Date.now();
    return fetch(baitUrl, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      .then(() => false) // request đi qua được (dù 404) => không bị chặn ở tầng network
      .catch(() => true); // bị abort/blocked bởi extension => coi như có AdBlock
  }

  function runDetection() {
    Promise.all([detectViaDomBait(), detectViaNetworkBait()]).then(([domBlocked, netBlocked]) => {
      if (domBlocked || netBlocked) {
        showOverlay();
      } else {
        hideOverlayIfClear();
      }
    });
  }

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    runDetection();
    // Kiểm tra lại định kỳ — bắt được cả trường hợp bật AdBlock SAU
    // khi trang đã tải xong, hoặc tắt rồi nhưng chưa tải lại trang.
    window.setInterval(runDetection, 4000);
  }

  init();
})();
