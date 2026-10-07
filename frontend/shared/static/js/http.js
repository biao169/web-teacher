(() => {
  'use strict';
  class RequestError extends Error {
    constructor(message, {status = 0, code = 'NETWORK_ERROR', fields = {}, uncertain = false} = {}) {
      super(message); this.name = 'RequestError'; Object.assign(this, {status, code, fields, uncertain});
    }
  }
  async function request(path, {method = 'GET', data, binary, csrf, timeoutMs = 10000, signal} = {}) {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) throw new RequestError('只允许访问本站接口。', {code: 'CROSS_ORIGIN'});
    if (binary !== undefined && (data !== undefined || !(binary instanceof Blob) || binary.size > 1048576)) throw new RequestError('分块参数无效。', {code: 'INVALID_BINARY'});
    const write = !['GET', 'HEAD'].includes(method.toUpperCase());
    const headers = {'Accept': 'application/json'};
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    if (binary !== undefined) headers['Content-Type'] = 'application/octet-stream';
    if (write) {
      if (!csrf) throw new RequestError('页面校验信息缺失，请重新登录。', {code: 'CSRF_INVALID', status: 403});
      headers['X-CSRF-Token'] = csrf;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetch(url.href, {method, headers, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        body: binary !== undefined ? binary : data === undefined ? undefined : JSON.stringify(data), signal: controller.signal});
      let body;
      try { body = await response.json(); }
      catch { throw new RequestError('服务器响应格式异常，请核对保存结果。', {status: response.status, code: 'INVALID_RESPONSE', uncertain: write}); }
      if (!response.ok) {
        throw new RequestError(body?.error?.message || '请求未成功，请稍后重试。', {status: response.status,
          code: body?.error?.code || 'HTTP_ERROR', fields: body?.error?.fields || {}, uncertain: write && response.status >= 500});
      }
      if (!body || !Object.prototype.hasOwnProperty.call(body, 'data')) throw new RequestError('服务器响应不完整。', {code: 'INVALID_RESPONSE', uncertain: write});
      return body;
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError(controller.signal.aborted ? '请求超时或已取消，保存结果未确认。' : '网络连接中断，保存结果未确认。',
        {code: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR', uncertain: write});
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  window.TeacherHTTP = Object.freeze({request, RequestError});
})();
