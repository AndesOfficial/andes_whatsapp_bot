import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import LiveChat from './pages/LiveChat'
import Orders from './pages/Orders'
import Login from './pages/Login'
import { Toaster } from 'react-hot-toast'
import { auth } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoadingAuth(false)
    })
    return () => unsubscribe()
  }, [])

  if (loadingAuth) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-950">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <Login />
        <Toaster position="top-right" />
      </>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-950">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <ErrorBoundary>
          <Routes>
            <Route path="/chat" element={<LiveChat />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Toaster position="top-right" />
    </div>
  )
}

export default App
