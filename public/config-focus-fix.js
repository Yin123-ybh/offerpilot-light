// Keep the API settings modal in the channel the user is editing.
(() => {
  let voiceInteraction = false
  document.addEventListener('pointerdown', event => {
    const channel = event.target.closest?.('.model-channel')
    voiceInteraction = Boolean(channel?.classList.contains('voice-channel'))
  }, true)
  document.addEventListener('focusin', event => {
    if (!voiceInteraction || !event.target.matches?.('.model-channel:not(.voice-channel) input')) return
    event.preventDefault()
    event.target.blur()
    requestAnimationFrame(() => {
      const voiceInput = document.querySelector('.voice-channel input')
      voiceInput?.focus({ preventScroll: true })
    })
  }, true)
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest?.('.voice-channel')) voiceInteraction = false
  }, false)
})()
