import {adminFetch} from './native-access.js?v=0.15.28';
/** Shared editor save lifecycle; server authorization and version checks remain authoritative. */
import {rememberNotice} from './native-notifications.js';
const form = document.querySelector('#native-editor');
if (form) {
  const feedback = form.querySelector('[data-save-feedback]');
  const status = document.querySelector('[data-save-status]');
  let busy = false;
  // Enter in a helper input invokes that helper instead of implicitly saving the record.
  form.addEventListener('keydown', event => {
    const buttonId = event.target.dataset.enterButton;
    if (buttonId && event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      document.getElementById(buttonId)?.click();
    }
  });
  // Labels supplement switch colors, including for readers with impaired color perception.
  form.querySelectorAll('.form-switch input').forEach(input => {
    input.addEventListener('change', () => {
      input.parentElement.querySelector('[data-state-label]').textContent = input.checked ? '✓ 已开启' : '○ 未开启';
    });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    // Allow other submit listeners (including the HTML editor) to flush their current value.
    await Promise.resolve();
    const data = new URLSearchParams(new FormData(form));
    if (event.submitter?.name) data.set(event.submitter.name, event.submitter.value);
    const buttons = [...form.elements].filter(e => e.tagName === 'BUTTON' && !e.disabled);
    buttons.forEach(button => button.disabled = true);
    form.inert = true;
    form.setAttribute('aria-busy', 'true');
    feedback.hidden = true;
    status.textContent = '正在保存…';
    let succeeded = false;
    try {
      const response = await adminFetch(form.action, {method: 'POST', headers: {'Accept': 'application/json'}, body: data});
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || '保存失败，请核对输入后重试。');
      }
      status.textContent = '✓ 已保存';
      // Fetch omits redirect fragments; an explicit button anchor restores the relevant tool section.
      const target = new URL(response.url);
      if (event.submitter?.dataset.successAnchor) target.hash = event.submitter.dataset.successAnchor;
      rememberNotice('已保存', 'success', target.href);
      location.assign(target.href);
      succeeded = true;
    } catch (error) {
      form.inert = false;
      feedback.textContent = (error instanceof TypeError ? '网络请求未完成，请核实保存结果后重试。' : error.message) + ' 当前输入已保留。';
      feedback.hidden = false;
      feedback.focus();
      status.textContent = '保存未完成';
    } finally {
      // Keep a successful form locked until navigation, especially while creating a new row.
      if (!succeeded) {
        busy = false;
        form.inert = false;
        form.removeAttribute('aria-busy');
        buttons.forEach(button => button.disabled = false);
        form.dispatchEvent(new Event('native-save-failed'));
      }
    }
  });
}
