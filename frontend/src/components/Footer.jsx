import React from 'react';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  return (
    <footer className="glass-panel mt-16 py-8 sm:py-12">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand Section */}
          <div>
            <div className="flex items-center space-x-2 mb-4 cursor-pointer" onClick={scrollToTop}>
              <i className="fas fa-cube text-2xl text-blue-400 animate-pulse"></i>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                FundVlog 3D
              </span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Empowering visionaries with cutting-edge funding solutions and immersive vlog content. Join the future of business funding.
            </p>
            <div className="flex space-x-4 mt-4">
              <a href="#" className="text-gray-400 hover:text-blue-400 transition text-xl">
                <i className="fab fa-twitter"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-blue-400 transition text-xl">
                <i className="fab fa-linkedin"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-blue-400 transition text-xl">
                <i className="fab fa-github"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-blue-400 transition text-xl">
                <i className="fab fa-youtube"></i>
              </a>
            </div>
          </div>
          
          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4 text-lg">Quick Links</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><a href="#home" className="hover:text-blue-400 transition flex items-center gap-2"><i className="fas fa-chevron-right text-xs"></i> Home</a></li>
              <li><a href="#vlogs" className="hover:text-blue-400 transition flex items-center gap-2"><i className="fas fa-chevron-right text-xs"></i> Vlogs</a></li>
              <li><a href="#support" className="hover:text-blue-400 transition flex items-center gap-2"><i className="fas fa-chevron-right text-xs"></i> Support</a></li>
              <li><a href="#" className="hover:text-blue-400 transition flex items-center gap-2"><i className="fas fa-chevron-right text-xs"></i> About Us</a></li>
            </ul>
          </div>
          
          {/* Resources */}
          <div>
            <h4 className="font-semibold mb-4 text-lg">Resources</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><a href="#" className="hover:text-blue-400 transition flex items-center gap-2"><i className="fas fa-chevron-right text-xs"></i> Funding Guide</a></li>
              <li><a href="#" className="hover:text-blue-400 transition flex items-center gap-2"><i className="fas fa-chevron-right text-xs"></i> FAQ</a></li>
              <li><a href="#" className="hover:text-blue-400 transition flex items-center gap-2"><i className="fas fa-chevron-right text-xs"></i> Blog</a></li>
              <li><a href="#" className="hover:text-blue-400 transition flex items-center gap-2"><i className="fas fa-chevron-right text-xs"></i> Case Studies</a></li>
            </ul>
          </div>
          
          {/* Contact Info */}
          <div>
            <h4 className="font-semibold mb-4 text-lg">Contact</h4>
            <ul className="space-y-3 text-gray-400 text-sm">
              <li className="flex items-center gap-3">
                <i className="fas fa-envelope text-blue-400 w-5"></i>
                <span>support@fundvlog.com</span>
              </li>
              <li className="flex items-center gap-3">
                <i className="fas fa-phone text-blue-400 w-5"></i>
                <span>+1 (888) 123-4567</span>
              </li>
              <li className="flex items-center gap-3">
                <i className="fas fa-map-marker-alt text-blue-400 w-5"></i>
                <span>San Francisco, CA</span>
              </li>
              <li className="flex items-center gap-3">
                <i className="fas fa-clock text-blue-400 w-5"></i>
                <span>24/7 Support</span>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-white/10 pt-6 text-center text-gray-400 text-sm">
          <p>&copy; {currentYear} FundVlog 3D. All rights reserved. | Built with React, Three.js, Firebase & Supabase</p>
          <div className="flex justify-center gap-4 mt-3 text-xs">
            <a href="#" className="hover:text-blue-400 transition">Privacy Policy</a>
            <a href="#" className="hover:text-blue-400 transition">Terms of Service</a>
            <a href="#" className="hover:text-blue-400 transition">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;