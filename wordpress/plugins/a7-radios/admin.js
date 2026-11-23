document.querySelectorAll('.a7r-editor').forEach(editor => {
  const textarea = editor.querySelector('textarea')
  const preview = editor.querySelector('.a7r-document-preview')
  editor.querySelectorAll('[data-prefix]').forEach(button => {
    button.addEventListener('click', () => {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const suffix = button.dataset.suffix ?? ''
      textarea.setRangeText(button.dataset.prefix + textarea.value.slice(start, end) + suffix, start, end, 'select')
      textarea.focus()
    })
  })
  const trigger = editor.querySelector('[data-preview-button]')
  trigger.addEventListener('click', async () => {
    trigger.disabled = true
    const body = new URLSearchParams({ action: 'a7r_document_preview', _ajax_nonce: editor.dataset.preview, content: textarea.value })
    try {
      const response = await fetch(ajaxurl, { method: 'POST', body, credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok || !result.success) throw Error()
      preview.innerHTML = result.data
    } catch {
      preview.textContent = 'Não foi possível carregar a prévia.'
    } finally {
      preview.hidden = false
      preview.focus()
      trigger.disabled = false
    }
  })
})
