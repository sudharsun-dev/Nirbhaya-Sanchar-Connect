export default function ConnectionStatus({ status }) {
  const label = status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Disconnected' : status === 'error' ? 'Call unavailable' : 'Connecting...'
  return <div className={`connection-status ${status}`}><span /> {label}</div>
}