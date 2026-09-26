import { useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'

export function App({ a, b }: { a: string; b: string }) {
  const [n] = useState(0)
  const detail = `${a} → ${b}`
  const hint = '↗'
  return (
    <div>
      <button><RefreshCw size={15} /> Refresh</button>
      <button><Sparkles size={16} /> Think with my AI ↗</button>
      <span className="vs">↔</span>
      <p>{detail} {hint} {n}</p>
    </div>
  )
}
