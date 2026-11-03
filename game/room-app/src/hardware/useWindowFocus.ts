import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Suit le focus de la page : sans focus, les buzzers (qui émulent un clavier)
 * ne sont plus reçus. L'écran affiche alors une alerte.
 */
export function useWindowFocus() {
  const hasFocus = ref(typeof document === 'undefined' ? true : document.hasFocus())

  function update(): void {
    hasFocus.value = document.visibilityState === 'visible' && document.hasFocus()
  }

  onMounted(() => {
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    document.addEventListener('visibilitychange', update)
    update()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('focus', update)
    window.removeEventListener('blur', update)
    document.removeEventListener('visibilitychange', update)
  })

  return { hasFocus }
}
