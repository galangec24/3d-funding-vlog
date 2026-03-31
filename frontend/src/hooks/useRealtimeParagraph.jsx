import { useState, useEffect } from 'react';
import { subscribeToParagraph, getParagraph, initParagraph } from '../services/firebase';

export const useRealtimeParagraph = () => {
  const [paragraph, setParagraph] = useState('Loading...');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    let unsubscribe;
    
    const init = async () => {
      try {
        // Initialize default paragraph if needed
        await initParagraph();
        
        // Get initial value
        const initial = await getParagraph();
        setParagraph(initial);
        setLoading(false);
        
        // Subscribe to real-time updates
        unsubscribe = subscribeToParagraph((newText) => {
          setParagraph(newText);
        });
      } catch (error) {
        console.error('Error loading paragraph:', error);
        setParagraph('Failed to load content. Please refresh.');
        setLoading(false);
      }
    };
    
    init();
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);
  
  return { paragraph, loading };
};