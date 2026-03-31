import React, { useState, useEffect } from 'react';
import axios from 'axios';

const VlogGrid = () => {
  const [vlogs, setVlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVlog, setSelectedVlog] = useState(null);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    fetchVlogs();
  }, []);
  
  const fetchVlogs = async () => {
    try {
      setLoading(true);
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const response = await axios.get(`${backendUrl}/api/vlogs`);
      if (response.data.success) {
        setVlogs(response.data.vlogs);
      } else {
        throw new Error('Failed to fetch vlogs');
      }
    } catch (error) {
      console.error('Error fetching vlogs:', error);
      setError('Unable to load vlogs. Please try again later.');
      // Fallback demo data
      setVlogs([
        { 
          id: 1, 
          title: 'Funding Innovation 2026', 
          video_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', 
          thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg' 
        },
        { 
          id: 2, 
          title: 'AI meets Venture Capital', 
          video_url: 'https://www.youtube.com/embed/3JZ_D3ELwOQ', 
          thumbnail: 'https://img.youtube.com/vi/3JZ_D3ELwOQ/0.jpg' 
        },
        { 
          id: 3, 
          title: 'Startup Growth Hacks', 
          video_url: 'https://www.youtube.com/embed/ScMzIvxBSi4', 
          thumbnail: 'https://img.youtube.com/vi/ScMzIvxBSi4/0.jpg' 
        },
      ]);
    } finally {
      setLoading(false);
    }
  };
  
  const playVlog = (vlog) => {
    setSelectedVlog(vlog);
    document.body.style.overflow = 'hidden';
  };
  
  const closeModal = () => {
    setSelectedVlog(null);
    document.body.style.overflow = 'auto';
  };
  
  if (loading) {
    return (
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16" id="vlogs">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-purple-500/20 rounded-full animate-pulse"></div>
          <div className="h-8 w-48 bg-white/10 rounded-lg animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card h-80 loading-shimmer rounded-xl"></div>
          ))}
        </div>
      </section>
    );
  }
  
  if (error && vlogs.length === 0) {
    return (
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16" id="vlogs">
        <div className="glass-card p-8 text-center">
          <i className="fas fa-exclamation-triangle text-5xl text-yellow-500 mb-4"></i>
          <p className="text-gray-300">{error}</p>
          <button onClick={fetchVlogs} className="mt-4 btn-primary">
            <i className="fas fa-sync-alt mr-2"></i> Retry
          </button>
        </div>
      </section>
    );
  }
  
  return (
    <>
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16" id="vlogs">
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <i className="fas fa-video text-3xl sm:text-4xl text-purple-400 animate-pulse"></i>
            <h2 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
              Latest Vlog Episodes
            </h2>
          </div>
          <p className="text-gray-300 max-w-2xl mx-auto">
            Exclusive insights from industry leaders, funding experts, and successful entrepreneurs
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {vlogs.map((vlog) => (
            <div
              key={vlog.id}
              className="glass-card overflow-hidden transform transition-all duration-300 hover:scale-105 cursor-pointer group"
              onClick={() => playVlog(vlog)}
            >
              <div className="relative overflow-hidden">
                <img
                  src={vlog.thumbnail}
                  alt={vlog.title}
                  className="w-full h-48 sm:h-56 object-cover group-hover:scale-110 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="bg-white/20 backdrop-blur rounded-full p-4 transform scale-90 group-hover:scale-100 transition-transform">
                    <i className="fas fa-play text-3xl sm:text-4xl text-white"></i>
                  </div>
                </div>
                <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
                  <i className="fas fa-clock mr-1"></i> 15:30
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <h3 className="font-bold text-lg sm:text-xl mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">
                  {vlog.title}
                </h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <i className="fas fa-eye"></i>
                    <span>1.2K views</span>
                    <i className="fas fa-heart ml-2"></i>
                    <span>234</span>
                  </div>
                  <button className="text-blue-400 hover:text-blue-300 transition-colors text-sm font-semibold">
                    Watch Now <i className="fas fa-arrow-right ml-1"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      
      {/* Video Modal */}
      {selectedVlog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4" onClick={closeModal}>
          <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300 transition-colors z-10"
              onClick={closeModal}
            >
              <i className="fas fa-times-circle"></i>
            </button>
            <div className="relative pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-2xl">
              <iframe
                className="absolute top-0 left-0 w-full h-full"
                src={`${selectedVlog.video_url}?autoplay=1&rel=0&modestbranding=1`}
                title={selectedVlog.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
            <div className="mt-4 text-center">
              <h3 className="text-xl font-bold">{selectedVlog.title}</h3>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default VlogGrid;