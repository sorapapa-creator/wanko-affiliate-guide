'use strict';
(() => {
  const form = document.getElementById('partner-inquiry');
  if (!form) return;
  const endpoint = form.dataset.endpoint || '';
  const configured = /^https:\/\/formspree\.io\/f\/[a-zA-Z0-9]+$/.test(endpoint);
  const status = document.getElementById('form-status');
  if (configured) {
    form.action = endpoint;
    form.querySelector('fieldset').disabled = false;
    status.textContent = '必要事項をご記入ください。送信後、受付サービスの確認画面へ進みます。';
  }
  form.addEventListener('submit', event => {
    if (!configured || form.elements._gotcha.value || !form.reportValidity()) {
      event.preventDefault();
      return;
    }
    // Native POST preserves provider-managed CAPTCHA; never fake a success message.
    form.querySelector('button[type="submit"]').disabled = true;
    status.textContent = '受付サービスへ接続しています。';
  });
  window.addEventListener('pageshow', () => {
    if (configured) form.querySelector('button[type="submit"]').disabled = false;
  });
})();
