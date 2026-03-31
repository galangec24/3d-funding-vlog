import React from 'react';
import { useRealtimeParagraph } from '../hooks/useRealtimeParagraph';

const HeroSection = () => {
  const paragraph = useRealtimeParagraph();
  
  const scrollToVlogs = () => {
    const vlogSection = document.querySelector('#vlogs');
    if (vlogSection) {
      vlogSection.scrollIntoView({ behavior: 'smooth' });
    }
  };
  
  return (
    <section id="home" className="container mx-auto px-4 sm:px-6 pt-24 sm:pt-32 md:pt-40 pb-12 sm:pb-16 md:pb-20 text-center">
      <div className="glass-card max-w-5xl mx-auto p-6 sm:p-8 md:p-12 transform hover:scale-105 transition-all duration-500">
        {/* Animated Icon */}
        <div className="mb-6 sm:mb-8">
          <div className="inline-block p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full animate-pulse">
            <i className="fas fa-chart-line text-4xl sm:text-5xl md:text-6xl text-blue-400 animate-float"></i>
          </div>
        </div>
        
        {/* Main Title */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold mb-4 sm:mb-6 bg-gradient-to-r from-cyan-300 via-blue-500 to-purple-600 bg-clip-text text-transparent animate-gradient">
          Funding Reimagined
        </h1>
        
        {/* Subtitle */}
        <p className="text-base sm:text-lg md:text-xl lg:text-2xl leading-relaxed font-light text-gray-100 mb-6 sm:mb-8">
          {paragraph}
        </p>
        
        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <button className="btn-primary group">
            <i className="fas fa-rocket mr-2 group-hover:translate-x-1 transition-transform"></i>
            Get Funded Now
            <i className="fas fa-arrow-right ml-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-10px] group-hover:translate-x-0"></i>
          </button>
          <button 
            onClick={scrollToVlogs}
            className="btn-secondary group"
          >
            <i className="fas fa-play mr-2 group-hover:scale-110 transition-transform"></i>
            Watch Vlog
            <i className="fas fa-play ml-2 opacity-0 group-hover:opacity-100 transition-all"></i>
          </button>
        </div>
        
        {/* Stats */}
        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-white/20 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-blue-400">$50M+</div>
            <div className="text-xs sm:text-sm text-gray-400">Funds Deployed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-purple-400">200+</div>
            <div className="text-xs sm:text-sm text-gray-400">Startups Funded</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-pink-400">95%</div>
            <div className="text-xs sm:text-sm text-gray-400">Success Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-green-400">24/7</div>
            <div className="text-xs sm:text-sm text-gray-400">Support</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;