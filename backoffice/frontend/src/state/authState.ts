import { computed, ref } from 'vue'

import { clearToken, getApiBase, getToken, logoutApi, onAuthChanged, TOKEN_KEY } from '@/utils/auth'

export type PublicMe = {
  id: string | number
  companyId: string | number
  role: string
  firstname?: string
  lastname?: string
  username?: string
  email?: string
}

const token = ref<string | null>(getToken())
const isAuthenticated = computed(() => Boolean(token.value))
const me = ref<PublicMe | null>(null)

function sync(): void {
  token.value = getToken()
  if (!token.value) me.value = null
}

let initialized = false
function init() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener('storage', (event) => {
    if (event.key === TOKEN_KEY) sync()
  })

  onAuthChanged(sync)
}

init()

export async function refreshMe(): Promise<PublicMe | null> {
  if (!token.value) {
    me.value = null
    return null
  }

  const API_BASE = getApiBase()
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token.value}`)

  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers,
      credentials: 'include',
    })

    if (!res.ok) {
      if (res.status === 401) {
        clearToken()
        sync()
      }
      return null
    }

    const data: unknown = await res.json().catch(() => null)

    const admin = (data as { admin?: PublicMe } | null)?.admin ?? null
    me.value = admin
    return admin
  } catch {
    return me.value
  }
}

export async function logout(): Promise<void> {
  const tokenValue = token.value
  clearToken()
  sync()
  if (tokenValue) await logoutApi(tokenValue)
}

export const authState = {
  token,
  isAuthenticated,
  me,
  sync,
  refreshMe,
  logout,
}

export { isAuthenticated, me,token }
