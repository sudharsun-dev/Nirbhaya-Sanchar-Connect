import { Room, RoomEvent, createLocalAudioTrack } from 'livekit-client'

function asElements(value) { return Array.isArray(value) ? value : value ? [value] : [] }

export async function getLiveKitToken(roomName, identity) {
  if (!roomName || !identity) throw new Error('A room and display name are required.')
  const apiBaseUrl = import.meta.env.DEV ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001') : ''
  const apiUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/token`
  console.info('[TOKEN] requesting token')
  console.info('[TOKEN] API URL:', apiUrl)
  let response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, identity }),
    })
  } catch {
    throw new Error('Token server unavailable. Make sure the Nirbhaya Sanchar server is running on port 3001.')
  }
  console.info('[TOKEN] response status:', response.status)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.token || !payload.serverUrl) throw new Error('Unable to obtain call authorization.')
  console.info('[TOKEN] token received:', true)
  console.info('[TOKEN] serverUrl received:', true)
  return { token: payload.token, serverUrl: payload.serverUrl }
}

export async function connectToRoom(roomName, identity, handlers = {}) {
  const room = new Room({ adaptiveStream: false, dynacast: false })
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== 'audio') return
    asElements(track.attach()).forEach((element) => { element.autoplay = true; document.body.appendChild(element) })
    console.info('[LIVEKIT] remote audio subscribed')
    handlers.onTrackSubscribed?.(track)
  })
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    asElements(track.detach()).forEach((element) => element.remove())
    handlers.onTrackUnsubscribed?.(track)
  })
  room.on(RoomEvent.ParticipantConnected, (participant) => { console.info('[LIVEKIT] participant joined'); handlers.onParticipantChange?.(participant, room) })
  room.on(RoomEvent.ParticipantDisconnected, (participant) => { console.info('[LIVEKIT] participant left'); handlers.onParticipantChange?.(participant, room) })
  room.on(RoomEvent.ConnectionStateChanged, handlers.onConnectionState)
  room.on(RoomEvent.Disconnected, () => { console.info('[LIVEKIT] disconnected'); handlers.onDisconnected?.() })
  console.info('[LIVEKIT] connecting')
  let token
  try {
    const authorization = await getLiveKitToken(roomName, identity)
    if (!authorization.serverUrl.startsWith('wss://') || !authorization.serverUrl.includes('livekit.cloud')) throw new Error('Invalid LIVEKIT_URL')
    token = authorization.token
    await room.connect(authorization.serverUrl, token, { autoSubscribe: true })
  } catch (error) {
    room.disconnect()
    if (error.message.startsWith('Token server') || error.message.startsWith('Unable to obtain') || error.message === 'Invalid LIVEKIT_URL') throw error
    throw new Error('Unable to connect to the voice room.')
  }
  console.info('[LIVEKIT] connected')
  handlers.onParticipantChange?.(null, room)
  let microphone
  try {
    microphone = await createLocalAudioTrack()
    await room.localParticipant.publishTrack(microphone)
  } catch (error) {
    room.disconnect()
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') throw new Error('Microphone permission is required for voice calls.')
    throw new Error('Microphone is unavailable.')
  }
  console.info('[LIVEKIT] local microphone published')
  return { room, microphone }
}

export function disconnectFromRoom(room) {
  room?.remoteParticipants.forEach((participant) => participant.trackPublications.forEach((publication) => asElements(publication.track?.detach()).forEach((element) => element.remove())))
  room?.localParticipant.trackPublications.forEach((publication) => publication.track?.stop())
  room?.disconnect()
}