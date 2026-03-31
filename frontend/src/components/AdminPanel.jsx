import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { updateParagraph, getParagraph } from '../services/firebase';
import axios from 'axios';

const AdminPanel = ({ onClose }) => {
  const { user, isAdmin, login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [paragraphText, setParagraphText] = useState('');
  const [originalParagraph, setOriginalParagraph] = useState('');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const [stats, setStats] = useState({ totalTickets: 0, totalVlogs: 0 });
  
  useEffect(() => {
    if (isAdmin) {
      fetchTickets();
      loadCurrentParagraph();
      fetchStats();
    }
  }, [isAdmin]);
  
  const loadCurrentParagraph = async () => {
    const current = await getParagraph();
    setOriginalParagraph(current);
    setParagraphText(current);
  };
  
  const fetchStats = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const response = await axios.get(`${backendUrl}/api/stats`);
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };
  
  const fetchTickets = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const response = await axios.get(`${backendUrl}/api/support-tickets`);
      if (response.data.success) {
        setTickets(response.data.tickets);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  };
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
    } catch (error) {
      alert('Login failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleUpdateParagraph = async () => {
    if (!paragraphText.trim()) return;
    setLoading(true);
    try {
      await updateParagraph(paragraphText);
      setOriginalParagraph(paragraphText);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      alert('❌ Update failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleReset = () => {
    if (window.confirm('Reset to original content? Unsaved changes will be lost.')) {
      setParagraphText(originalParagraph);
    }
  };
  
  const handleDiscard = () => {
    if (window.confirm('Discard all changes? Unsaved changes will be lost.')) {
      setParagraphText(originalParagraph);
    }
  };
  
  const updateTicketStatus = async (id, status) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      await axios.put(`${backendUrl}/api/support-tickets/${id}`, { status });
      fetchTickets();
    } catch (error) {
      console.error('Error updating ticket:', error);
    }
  };
  
  const getPreviewStyles = () => {
    switch(previewMode) {
      case 'mobile':
        return { width: '375px', height: '667px', overflow: 'auto', margin: '0 auto' };
      case 'tablet':
        return { width: '768px', height: '1024px', overflow: 'auto', margin: '0 auto' };
      default:
        return { width: '100%', height: 'auto' };
    }
  };
  
  const PreviewContent = () => (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-3 rounded-lg mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <i className="fas fa-eye"></i>
            <span className="font-semibold">Live Preview</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPreviewMode('mobile')}
              className={`px-3 py-1 rounded text-xs transition ${previewMode === 'mobile' ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <i className="fas fa-mobile-alt mr-1"></i> Mobile
            </button>
            <button
              onClick={() => setPreviewMode('tablet')}
              className={`px-3 py-1 rounded text-xs transition ${previewMode === 'tablet' ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <i className="fas fa-tablet-alt mr-1"></i> Tablet
            </button>
            <button
              onClick={() => setPreviewMode('desktop')}
              className={`px-3 py-1 rounded text-xs transition ${previewMode === 'desktop' ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
            >
              <i className="fas fa-desktop mr-1"></i> Desktop
            </button>
          </div>
        </div>
      </div>
      
      <div className="glass-card p-5">
        <div className="text-center">
          <div className="mb-3">
            <i className="fas fa-chart-line text-3xl text-blue-400"></i>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 to-purple-600 bg-clip-text text-transparent">
            Funding Reimagined
          </h1>
          <div className="mt-3 p-3 bg-white/5 rounded-lg">
            <p className="text-gray-200 text-sm leading-relaxed">
              {paragraphText || 'Loading preview...'}
            </p>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
            <button className="bg-blue-600 px-3 py-1.5 rounded-full text-xs">
              <i className="fas fa-rocket mr-1"></i> Get Funded
            </button>
            <button className="bg-white/20 px-3 py-1.5 rounded-full text-xs">
              <i className="fas fa-play mr-1"></i> Watch Vlog
            </button>
          </div>
        </div>
      </div>
      
      <div className="text-xs text-center text-gray-400">
        <i className="fas fa-info-circle mr-1"></i>
        This is a live preview. Changes appear as you type.
        {paragraphText !== originalParagraph && (
          <span className="text-yellow-400 ml-2 animate-pulse">
            • Unsaved changes detected
          </span>
        )}
      </div>
    </div>
  );
  
  if (!isAdmin) {
    return (
      <div className="glass-card p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold">Admin Login</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="admin@funding.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg font-semibold transition-colors"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="text-xs text-center mt-4 text-gray-400">
          Demo: admin@funding.com / admin123
        </p>
      </div>
    );
  }
  
  return (
    <div className="glass-card p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6 sticky top-0 bg-gray-900/95 backdrop-blur p-4 -mt-6 -mx-6 px-6 rounded-t-2xl z-10 border-b border-white/20">
        <div>
          <h3 className="text-2xl font-bold">Admin Control Panel</h3>
          <p className="text-sm text-gray-400">Welcome back, {user?.email}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.totalTickets}</div>
          <div className="text-xs text-gray-400">Total Tickets</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-400">{stats.totalVlogs}</div>
          <div className="text-xs text-gray-400">Total Vlogs</div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/20 overflow-x-auto">
        <button
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'editor' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <i className="fas fa-edit mr-2"></i> Content Editor
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <i className="fas fa-eye mr-2"></i> Live Preview
          {paragraphText !== originalParagraph && (
            <span className="ml-2 w-2 h-2 bg-yellow-400 rounded-full inline-block animate-pulse"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'tickets' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <i className="fas fa-ticket-alt mr-2"></i> Support Tickets
          {tickets.length > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {tickets.length}
            </span>
          )}
        </button>
      </div>
      
      {/* Content Editor Tab */}
      {activeTab === 'editor' && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center justify-between flex-wrap gap-2">
              <span><i className="fas fa-paragraph mr-2"></i> Main Paragraph Content</span>
              <span className="text-xs text-gray-400">
                <i className="fas fa-sync-alt mr-1"></i> Changes appear in preview
              </span>
            </label>
            <textarea
              value={paragraphText}
              onChange={(e) => setParagraphText(e.target.value)}
              rows="6"
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Enter the main paragraph text..."
            />
          </div>
          
          <div className="flex justify-between text-xs text-gray-400">
            <span>Characters: {paragraphText.length}</span>
            <span>Words: {paragraphText.trim().split(/\s+/).filter(w => w).length}</span>
          </div>
          
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleUpdateParagraph}
              disabled={loading || paragraphText === originalParagraph}
              className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><i className="fas fa-spinner fa-spin mr-2"></i> Publishing...</>
              ) : (
                <><i className="fas fa-globe mr-2"></i> Publish to Live Site</>
              )}
            </button>
            <button
              onClick={handleDiscard}
              disabled={paragraphText === originalParagraph}
              className="px-4 bg-yellow-600 hover:bg-yellow-700 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fas fa-undo mr-2"></i> Discard
            </button>
            <button
              onClick={handleReset}
              className="px-4 bg-gray-600 hover:bg-gray-700 py-2 rounded-lg font-semibold transition-colors"
            >
              <i className="fas fa-history mr-2"></i> Reset
            </button>
          </div>
          
          {saveSuccess && (
            <div className="bg-green-500/20 border border-green-500 rounded-lg p-3 text-green-300 text-sm animate-slideDown">
              <i className="fas fa-check-circle mr-2"></i>
              Content published successfully! Changes are now live.
            </div>
          )}
          
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h4 className="font-semibold mb-2 flex items-center">
              <i className="fas fa-info-circle mr-2 text-blue-400"></i>
              Pro Tips:
            </h4>
            <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
              <li>Use <strong>Live Preview</strong> to see mobile/tablet/desktop views</li>
              <li>Click <strong>Publish</strong> to make changes live immediately</li>
              <li>All changes sync in real-time to Firebase</li>
            </ul>
          </div>
        </div>
      )}
      
      {/* Live Preview Tab */}
      {activeTab === 'preview' && (
        <div className="space-y-4">
          <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 text-sm">
            <i className="fas fa-info-circle mr-2 text-blue-400"></i>
            Live preview showing how content appears on different devices.
          </div>
          
          <div className="flex justify-center overflow-x-auto">
            <div 
              style={getPreviewStyles()}
              className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-2xl transition-all duration-300"
            >
              <div className="p-4">
                <PreviewContent />
              </div>
            </div>
          </div>
          
          <div className="mt-6">
            <h4 className="font-semibold mb-3 flex items-center">
              <i className="fas fa-columns mr-2"></i>
              Before & After Comparison
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-xs text-gray-400 mb-2">Current Live Version</div>
                <p className="text-sm text-gray-300 line-clamp-4">{originalParagraph}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4 border border-blue-500/30">
                <div className="text-xs text-blue-400 mb-2 flex items-center">
                  <i className="fas fa-edit mr-1"></i> Draft Version
                  {paragraphText !== originalParagraph && (
                    <span className="ml-2 text-yellow-400 text-xs">(Unsaved)</span>
                  )}
                </div>
                <p className="text-sm text-gray-300 line-clamp-4">{paragraphText}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Support Tickets Tab */}
      {activeTab === 'tickets' && (
        <div>
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h4 className="text-xl font-semibold">
              <i className="fas fa-ticket-alt mr-2"></i>
              Customer Support Tickets
            </h4>
            <button
              onClick={fetchTickets}
              className="text-sm bg-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-700 transition"
            >
              <i className="fas fa-sync-alt mr-1"></i> Refresh
            </button>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {tickets.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <i className="fas fa-inbox text-4xl mb-2"></i>
                <p>No support tickets yet.</p>
              </div>
            ) : (
              tickets.map((ticket) => (
                <div key={ticket.id} className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors">
                  <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold">{ticket.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          ticket.status === 'open' ? 'bg-green-600' : 'bg-gray-600'
                        }`}>
                          {ticket.status || 'open'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">{ticket.email}</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(ticket.created_at).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-sm mt-2 text-gray-300">{ticket.message}</p>
                  <div className="mt-3 flex gap-2">
                    {ticket.status === 'open' && (
                      <button 
                        onClick={() => updateTicketStatus(ticket.id, 'resolved')}
                        className="text-xs bg-green-600 px-3 py-1 rounded hover:bg-green-700 transition"
                      >
                        <i className="fas fa-check mr-1"></i> Mark Resolved
                      </button>
                    )}
                    <button className="text-xs bg-blue-600 px-3 py-1 rounded hover:bg-blue-700 transition">
                      <i className="fas fa-reply mr-1"></i> Reply
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {tickets.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">{tickets.length}</div>
                <div className="text-xs text-gray-400">Total</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-400">
                  {tickets.filter(t => t.status === 'open').length}
                </div>
                <div className="text-xs text-gray-400">Open</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-400">
                  {tickets.filter(t => t.status !== 'open').length}
                </div>
                <div className="text-xs text-gray-400">Resolved</div>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="mt-6 pt-4 border-t border-white/20">
        <button
          onClick={logout}
          className="w-full bg-red-600 hover:bg-red-700 py-2 rounded-lg font-semibold transition-colors"
        >
          <i className="fas fa-sign-out-alt mr-2"></i>
          Logout
        </button>
      </div>
    </div>
  );
};

export default AdminPanel;