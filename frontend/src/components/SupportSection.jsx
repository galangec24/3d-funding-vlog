import React, { useState } from 'react';
import axios from 'axios';

const SupportSection = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError(null);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    
    // Client-side validation
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      setError('Please fill in all fields');
      setSubmitting(false);
      return;
    }
    
    if (!formData.email.includes('@') || !formData.email.includes('.')) {
      setError('Please enter a valid email address');
      setSubmitting(false);
      return;
    }
    
    if (formData.message.length < 10) {
      setError('Message must be at least 10 characters');
      setSubmitting(false);
      return;
    }
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const response = await axios.post(`${backendUrl}/api/support-tickets`, formData);
      
      if (response.data.success) {
        setSubmitted(true);
        setFormData({ name: '', email: '', message: '' });
        setTimeout(() => setSubmitted(false), 5000);
      } else {
        throw new Error(response.data.error || 'Failed to submit ticket');
      }
    } catch (error) {
      console.error('Error submitting ticket:', error);
      setError(error.response?.data?.error || 'Failed to submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16" id="support">
      <div className="glass-card p-6 sm:p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-green-500/20 rounded-full mb-4">
            <i className="fas fa-headset text-3xl sm:text-4xl text-green-400"></i>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            Customer Support
          </h2>
          <p className="text-gray-300 max-w-2xl mx-auto">
            Have questions about funding? Our dedicated team responds within 24 hours. 
            Submit your inquiry below and we'll get back to you promptly.
          </p>
        </div>
        
        {submitted && (
          <div className="mb-6 bg-green-500/20 border border-green-500 rounded-lg p-4 text-green-300 animate-slideDown">
            <div className="flex items-center gap-3">
              <i className="fas fa-check-circle text-2xl"></i>
              <div>
                <p className="font-semibold">Ticket submitted successfully!</p>
                <p className="text-sm">We'll get back to you within 24 hours.</p>
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-300">
            <div className="flex items-center gap-3">
              <i className="fas fa-exclamation-circle text-2xl"></i>
              <p>{error}</p>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl mx-auto">
          <div>
            <label className="block text-sm font-medium mb-2">
              <i className="fas fa-user mr-2 text-blue-400"></i>
              Full Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="input-field"
              placeholder="John Doe"
              disabled={submitting}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              <i className="fas fa-envelope mr-2 text-blue-400"></i>
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="input-field"
              placeholder="john@example.com"
              disabled={submitting}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              <i className="fas fa-comment mr-2 text-blue-400"></i>
              Message *
            </label>
            <textarea
              name="message"
              value={formData.message}
              onChange={handleChange}
              required
              rows="5"
              className="input-field resize-none"
              placeholder="Describe your funding needs or technical issue..."
              disabled={submitting}
            ></textarea>
            <div className="text-right text-xs text-gray-400 mt-1">
              {formData.message.length}/500 characters
            </div>
          </div>
          
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Submitting...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane"></i>
                Submit Ticket
              </>
            )}
          </button>
        </form>
        
        <div className="mt-8 pt-6 border-t border-white/20 text-center text-sm text-gray-400">
          <p className="flex items-center justify-center gap-4 flex-wrap">
            <span><i className="fas fa-clock mr-1"></i> 24/7 Support</span>
            <span><i className="fas fa-shield-alt mr-1"></i> Secure & Private</span>
            <span><i className="fas fa-reply-all mr-1"></i> Average response: 2 hours</span>
          </p>
        </div>
      </div>
    </section>
  );
};

export default SupportSection;