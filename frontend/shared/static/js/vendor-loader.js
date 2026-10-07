(() => {
  const css = document.getElementById('bootstrap-css');
  if (!css) return;
  let done = false;
  const fallback = () => {
    if (done) return;
    done = true;
    css.removeAttribute('integrity'); css.removeAttribute('crossorigin');
    css.href = '/assets/shared/vendor/bootstrap.min.css';
  };
  css.addEventListener('error', fallback, {once:true});
  // Covers an error emitted before this deferred script attached its listener.
  setTimeout(() => {
    // A failed link can expose an empty stylesheet. Check Bootstrap's own token.
    if (!getComputedStyle(document.documentElement).getPropertyValue('--bs-blue').trim()) fallback();
  }, 1800);
})();
