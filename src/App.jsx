import { useState } from 'react'
import Sidebar from './components/Sidebar'
import LiveChat from './pages/LiveChat'
import Orders from './pages/Orders'

function App() {
  const [activePage, setActivePage] = useState('chat')

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-950">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <main className="flex-1 overflow-hidden">
        {activePage === 'chat' && <LiveChat />}
        {activePage === 'orders' && <Orders />}
      </main>
    </div>
  )
}

export default App
