import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const CampaignContext = createContext(null);
const CAMPAIGN_KEY = 'lg_campaign';

export function CampaignProvider({ children }) {
  const { authenticated } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [currentCampaign, setCurrentCampaign] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    if (!authenticated) return;
    try {
      const { data } = await apiClient.get('/campaigns');
      setCampaigns(data);

      const stored = localStorage.getItem(CAMPAIGN_KEY);
      const found = stored ? data.find((c) => c.id === stored) : null;
      setCurrentCampaign(found || data[0] || null);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const selectCampaign = useCallback((campaign) => {
    setCurrentCampaign(campaign);
    if (campaign) localStorage.setItem(CAMPAIGN_KEY, campaign.id);
    else localStorage.removeItem(CAMPAIGN_KEY);
  }, []);

  return (
    <CampaignContext.Provider value={{ campaigns, currentCampaign, selectCampaign, loading, refetch: fetchCampaigns }}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error('useCampaign must be used inside <CampaignProvider>');
  return ctx;
}
