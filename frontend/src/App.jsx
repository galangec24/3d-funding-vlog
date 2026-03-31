import React, { useState, useEffect } from 'react';
import ThreeScene from './components/ThreeScene';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import VlogGrid from './components/VlogGrid';
import SupportSection from './components/SupportSection';
import AdminPanel from './components/AdminPanel';
import Footer from './components/Footer';
import { AuthProvider } from './hooks/useAuth';
import { getHostingInfo } from './services/firebase';

function App() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [hostingInfo, setHostingInfo] = useState(null);
  
  useEffect(() => {
    const info = getHostingInfo();
    setHostingInfo(info);
    console.log('🚀 Deployed on Firebase Hosting:', info.url);
    console.log('📊 Backend API:', import.meta.env.VITE_BACKEND_URL);
  }, []);
  
  return (
    <AuthProvider>
      <div className="relative min-h-screen">
        <ThreeScene />
        
        <div className="relative z-10">
          <Navbar />
          
          <main>
            <HeroSection />
            <VlogGrid />
            <SupportSection />
          </main>
          
          <Footer />
          
          {/* Deployment Badge */}
          {hostingInfo && (
            <div className="fixed bottom-6 right-6 z-40 animate-bounce">
              <div className="bg-gradient-to-r from-orange-500 to-yellow-500 text-black text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 font-semibold">
                <i className="fas fa-fire text-sm"></i>
                <span>Hosted on {hostingInfo.domain}</span>
              </div>
            </div>
          )}
          
          {/* Admin Toggle Button */}
          <button
            onClick={() => setShowAdmin(!showAdmin)}
            className="fixed bottom-6 left-6 z-50 bg-gray-800/80 backdrop-blur p-3 rounded-full shadow-lg hover:bg-gray-700 transition-all duration-300 group"
            aria-label="Admin Panel"
          >
            <i className={`fas ${showAdmin ? 'fa-times' : 'fa-lock'} text-xl`}></i>
            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {showAdmin ? 'Close Admin Panel' : 'Open Admin Panel'}
            </span>
          </button>
          
          {/* Admin Panel Modal */}
          {showAdmin && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowAdmin(false)}>
              <div onClick={(e) => e.stopPropagation()}>
                <AdminPanel onClose={() => setShowAdmin(false)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthProvider>
  );
}

export default App;