// background.js
const SUPABASE_URL = 'https://nctyyffspvscotsscfex.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jdHl5ZmZzcHZzY290c3NjZmV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMDI2MjIsImV4cCI6MjA3NzY3ODYyMn0.TDlVi7wp4H0Drmnx9DnKZ5CxVotNnrbuR-C6EJsH6qE';

let supabaseClient = null;

async function initSupabase() {
  if (!supabaseClient) {
    const response = await fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js');
    const text = await response.text();
    const supabaseScript = new Blob([text], { type: 'text/javascript' });
    const workerURL = URL.createObjectURL(supabaseScript);
    await import(workerURL);
    URL.revokeObjectURL(workerURL);
    
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// Receives { needle, meta, url } and returns bookmark/history info
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_APPLIED_JOB") {
    saveAppliedJob(msg.jobData)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Will respond asynchronously
  }
  
  if (msg && msg.type === "CHECK_FINGERPRINT") {
    const { needle, url } = msg;

    Promise.all([
      searchBookmarks(needle),
      searchHistory(needle)
    ]).then(([bmResults, histResults]) => {
      const bookmarkMatches = bmResults || [];
      const historyMatches = histResults || [];
      const lastVisit = historyMatches.length
        ? new Date(Math.max(...historyMatches.map(r => r.lastVisitTime || 0))).toISOString()
        : null;

      sendResponse({
        ok: true,
        needle,
        url,
        bookmarkCount: bookmarkMatches.length,
        historyCount: historyMatches.length,
        lastVisit
      });
    }).catch(err => {
      sendResponse({ ok: false, error: String(err) });
    });

    return true; // keep channel open for async sendResponse
  }
});

function searchBookmarks(needle) {
  return new Promise((resolve) => {
    try {
      // substring match on title or URL
      chrome.bookmarks.search(needle, (nodes) => {
        const matches = (nodes || []).filter(n => n.url && n.url.includes(needle));
        resolve(matches);
      });
    } catch (e) {
      resolve([]);
    }
  });
}

function searchHistory(needle) {
  return new Promise((resolve) => {
    try {
      chrome.history.search(
        {
          text: needle,
          startTime: 0,           // from the beginning of recorded history
          maxResults: 1000
        },
        (results) => resolve(results || [])
      );
    } catch (e) {
      resolve([]);
    }
  });
}

async function saveAppliedJob(jobData) {
  try {
    const supabase = await initSupabase();
    const { error } = await supabase
      .from('positionApplied')
      .insert([{
        position_url: jobData.url,
        job_title: jobData.position_title,
        company: jobData.company_name,
        user: "2a17df40-f12c-4aa4-8952-3eebbcfa9809"
      }]);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Supabase error:', error);
    throw error;
  }
}
