/**
 * Older pages have inputs and selects with a visual caption but no programmatic label, so screen readers announce
 * them as "edit text". This gives every unlabeled control an aria-label taken from the closest caption, the
 * placeholder, or its name. New pages use <FormField>, which already links label and control; this only fills gaps.
 */
const CONTROLS = 'input:not([type=hidden]):not([type=file]), select, textarea';

function hasName(el) {
  return Boolean(
    (el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title,
  );
}

function captionFor(el) {
  const group = el.closest('.form-group, .filter-group, .field, .form-field, .search-field, .input-group');
  const caption = group?.querySelector('label, .label, .form-label');
  const text = caption && caption !== el ? caption.textContent.trim() : '';
  if (text) return text;
  const previous = el.previousElementSibling;
  if (previous && /^(LABEL|SPAN|DIV|P|STRONG)$/.test(previous.tagName) && previous.textContent.trim().length < 40) {
    return previous.textContent.trim();
  }
  if (el.placeholder) return el.placeholder;
  if (el.tagName === 'SELECT' && el.options?.length) return el.options[0].textContent.trim();
  if (el.type === 'checkbox') return el.closest('label')?.textContent.trim() || '';
  return el.name || '';
}

export function labelUnlabeledControls(root = document) {
  root.querySelectorAll(CONTROLS).forEach((el) => {
    if (hasName(el)) return;
    const text = captionFor(el);
    if (text) el.setAttribute('aria-label', text);
  });
}

/** Keep labelling controls as pages render. Returns a cleanup function. */
export function watchUnlabeledControls(root = document.body) {
  let queued = false;
  const run = () => { queued = false; labelUnlabeledControls(root); };
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    window.setTimeout(run, 150);
  });
  observer.observe(root, { childList: true, subtree: true });
  run();
  return () => observer.disconnect();
}
