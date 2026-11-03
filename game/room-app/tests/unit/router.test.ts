import { createMemoryHistory } from 'vue-router'

import { createRoomRouter } from '@/router'
import { enterDemo, signOut, syncRoomAuth } from '@/state/roomAuth'

describe('router de la salle', () => {
  beforeEach(() => {
    localStorage.clear()
    syncRoomAuth()
  })

  it('renvoie vers la connexion tant que la salle n’est pas connectée', async () => {
    const router = createRoomRouter(createMemoryHistory())
    await router.push('/play')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('laisse entrer en mode démo et saute la page de connexion', async () => {
    enterDemo()
    const router = createRoomRouter(createMemoryHistory())

    await router.push('/lobby')
    expect(router.currentRoute.value.name).toBe('lobby')

    await router.push('/login')
    expect(router.currentRoute.value.name).toBe('launch')

    await signOut()
    await router.push('/lobby')
    expect(router.currentRoute.value.name).toBe('login')
  })
})
