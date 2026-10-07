(() => {
  'use strict';
  // One feedback implementation shared by native forms and progressively enhanced editing.
  function clearErrors(form) {
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field-error').forEach(el => { el.hidden = true; el.textContent = ''; });
    const box = form.querySelector('[data-error-summary]');
    if (box) { box.hidden = true; box.querySelector('[data-error-links]').replaceChildren(); }
  }
  function showErrors(form, message, fields = {}) {
    const box = form.querySelector('[data-error-summary]');
    if (!box) return;
    box.hidden = false; box.querySelector('[data-error-message]').textContent = message;
    const list = box.querySelector('[data-error-links]'); list.replaceChildren();
    Object.entries(fields).forEach(([name, text]) => {
      const input = form.elements.namedItem(name);
      if (!(input instanceof HTMLElement) || !input.id) return;
      input.setAttribute('aria-invalid', 'true');
      const error = document.getElementById(`${input.id}-error`);
      if (error) { error.textContent = String(text); error.hidden = false; }
      const li = document.createElement('li'), link = document.createElement('a');
      link.href = `#${input.id}`; link.textContent = String(text);
      link.addEventListener('click', event => { event.preventDefault(); input.focus(); });
      li.append(link); list.append(li);
    });
    list.hidden = !list.children.length; box.focus();
  }
  document.querySelectorAll('form').forEach(form => {
    let invalidQueued = false;
    form.addEventListener('invalid', event => {
      if (!form.querySelector('[data-error-summary]')) return;
      event.preventDefault();
      if (invalidQueued) return;
      invalidQueued = true;
      queueMicrotask(() => {
        invalidQueued = false;
        const errors = {};
        Array.from(form.elements).forEach(input => {
          if (input.willValidate && !input.validity.valid) {
            const label = input.labels?.[0]?.textContent.replace('必填', '').trim() || '此项';
            errors[input.name] = `${label}：${input.validity.valueMissing ? '请填写此项' : '请检查格式或长度'}`;
          }
        });
        showErrors(form, '请检查以下内容后再保存。', errors);
      });
    }, true);
    if (form.matches('[data-native-form]')) {
      let submitting = false;
      form.addEventListener('submit', event => {
        if (submitting) { event.preventDefault(); return; }
        // 保留当前按钮动作；防重复提交不能丢失保存/删除等服务端意图。
        form.querySelector('[data-submitter-copy]')?.remove();
        if (event.submitter?.name) {
          const copy = document.createElement('input'); copy.type = 'hidden';
          copy.name = event.submitter.name; copy.value = event.submitter.value;
          copy.dataset.submitterCopy = 'true'; form.append(copy);
        }
        submitting = true; form.setAttribute('aria-busy', 'true');
        // button 的默认类型也是 submit，必须一起禁用，避免按钮动作与隐藏副本重复提交。
        Array.from(form.elements).filter(button => button.type === 'submit').forEach(button => { button.disabled = true; });
      });
      window.addEventListener('pageshow', () => {
        submitting = false; form.querySelector('[data-submitter-copy]')?.remove(); form.removeAttribute('aria-busy');
        Array.from(form.elements).filter(button => button.type === 'submit').forEach(button => { button.disabled = false; });
      });
    }
  });
  const initialError = document.querySelector('[data-error-summary]:not([hidden])');
  if (initialError) initialError.focus();
  // Native details works without JS. On mobile start compact; do not reset a user's choice on resize.
  const nav = document.querySelector('.module-nav');
  if (nav && window.matchMedia('(max-width:640px)').matches) nav.open = false;
  window.TeacherForms = Object.freeze({ clearErrors, showErrors });
})();
