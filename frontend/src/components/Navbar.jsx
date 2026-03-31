import React, { useState, useEffect } from 'react';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  const navItems = [
    { name: 'Home', href: '#home', icon: 'fas fa-home' },
    { name: 'Vlogs', href: '#vlogs', icon: 'fas fa-video' },
    { name: 'Support', href: '#support', icon: 'fas fa-headset' },
    { name: 'Contact', href: '#contact', icon: 'fas fa-envelope' },
  ];
  
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const scrollToSection = (href) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsOpen(false);
    }
  };
  
  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'glass-panel shadow-lg' : 'bg-transparent'}`}>
      <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div 
            className="flex items-center space-x-2 cursor-pointer group"
            onClick={() => scrollToSection('#home')}
          >
            <div className="relative">
              <i className="fas fa-cube text-2xl sm:text-3xl text-blue-400 animate-pulse group-hover:animate-spin transition-all duration-500"></i>
              <div className="absolute inset-0 bg-blue-400 blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
            </div>
            <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent animate-gradient">
              FundVlog 3D
            </span>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-1 lg:space-x-2">
            {navItems.map((item, index) => (
              <button
                key={index}
                onClick={() => scrollToSection(item.href)}
                className="px-4 py-2 rounded-full hover:bg-white/10 transition-all duration-300 font-medium flex items-center gap-2 group"
              >
                <i className={`${item.icon} text-sm group-hover:text-blue-400 transition-colors`}></i>
                <span className="group-hover:text-blue-400 transition-colors">{item.name}</span>
              </button>
            ))}
          </div>
          
          {/* CTA Button */}
          <div className="hidden md:block">
            <button className="bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2 rounded-full text-sm font-semibold hover:from-blue-700 hover:to-purple-700 transition-all transform hover:scale-105 shadow-lg">
              <i className="fas fa-rocket mr-2"></i>
              Get Funded
            </button>
          </div>
          
          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-2xl p-2 rounded-lg hover:bg-white/10 transition-colors"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            <i className={`fas ${isOpen ? 'fa-times' : 'fa-bars'}`}></i>
          </button>
        </div>
        
        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden mt-4 space-y-2 pb-4 animate-slideDown">
            {navItems.map((item, index) => (
              <button
                key={index}
                onClick={() => scrollToSection(item.href)}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-3"
              >
                <i className={`${item.icon} w-5 text-blue-400`}></i>
                <span>{item.name}</span>
              </button>
            ))}
            <button className="w-full mt-3 bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
              <i className="fas fa-rocket"></i>
              Get Funded Now
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;