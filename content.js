// content.js
(function () {
  function showNotification(message, isError = false) {
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: isError ? '#f44336' : '#4CAF50',
      color: 'white',
      padding: '12px 24px',
      borderRadius: '4px',
      zIndex: 2147483647,
      fontFamily: 'system-ui, sans-serif'
    });
    container.textContent = message;
    document.body.appendChild(container);
    setTimeout(() => container.remove(), 3000);
  }

  // Save applied job via background script
  async function saveAppliedJob() {
    try {
      // Get page title and try to extract position and company
      let pageTitle = document.title;
      let [positionTitle, companyName] = pageTitle.split(' - ').map(s => s.trim());
      
      // If title splitting didn't work, use the whole title as position
      if (!companyName) {
        positionTitle = pageTitle;
        companyName = new URL(location.href).hostname.replace(/^(jobs|careers|www)\./i, '');
      }
      
      const jobData = {
        url: location.href,
        position_title: positionTitle,
        company_name: companyName
      };

      const response = await chrome.runtime.sendMessage({ 
        type: "SAVE_APPLIED_JOB", 
        jobData 
      });

      if (response.error) throw new Error(response.error);
      showNotification('✓ Saved as applied!');
      
    } catch (error) {
      console.error('Error saving applied job:', error);
      showNotification('❌ Failed to save: ' + error.message, true);
    }
  }

  // Listen for Alt+A keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      // saveAppliedJob();
    }
  });

  // Detect a stable "fingerprint" for lots of job boards:
  // UUIDs (Ashby), numeric IDs (Greenhouse/SmartRecruiters/UHG), slugs (Lever), req IDs (Workday), etc.
  const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    async function copyToClipboard(text) {
    // Copy to clipboard
    // await navigator.clipboard.writeText(text);
    
    // Create popup container
    const container = document.createElement('div');
    container.id = 'job-details-popup';
    Object.assign(container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '400px',
      maxHeight: '80vh',
      background: '#ffffff',
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      borderRadius: '8px',
      zIndex: 2147483647,
      overflow: 'auto',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: '14px',
      lineHeight: '1.5'
    });

    // Create header with close button
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '12px',
      background: '#f8f9fa',
      borderBottom: '1px solid #e9ecef',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '8px'
    });
    
    const title = document.createElement('div');
    title.textContent = 'Job Details';
    title.style.fontWeight = 'bold';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '16px',
      padding: '4px 8px'
    });
    closeBtn.onclick = () => container.remove();
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    container.appendChild(header);

    // Create content area
    const content = document.createElement('div');
    content.style.padding = '16px';
    
    // Format and style the text content
    const lines = text.split('\n');
    lines.forEach(line => {
      const p = document.createElement('p');
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        p.innerHTML = `<strong>${key}:</strong> ${value || ''}`;
      } else {
        p.textContent = line;
      }
      Object.assign(p.style, {
        margin: '0 0 12px 0',
        color: '#333'
      });
      content.appendChild(p);
    });
    
    container.appendChild(content);
    document.body.appendChild(container);

    // Auto-remove after 10 seconds
    setTimeout(() => container.remove(), 10000);
  }

  // Return a fingerprint object: { site, idType, needle } or null if not found
  function getJobFingerprint(u) {
    let url;
    try { url = new URL(u); } catch { return null; }
    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    const qp = url.searchParams;

    // 1) Universal: UUID anywhere in URL (Ashby and others)
    const uuid = u.match(UUID_REGEX)?.[0];
    if (uuid) return { site: "generic", idType: "uuid", needle: uuid };

    // 2) Indeed: jk / vjk
    if (/indeed\./.test(host)) {
      const jk = qp.get("jk") || qp.get("vjk");
      if (jk) return { site: "indeed", idType: "jk", needle: jk };
    }

    // 3) Greenhouse: gh_jid or /jobs/<id>
    if (/(\bgreenhouse\.io|\bboards\.greenhouse\.io)$/.test(host)) {
      const ghjid = qp.get("gh_jid");
      if (ghjid) return { site: "greenhouse", idType: "gh_jid", needle: ghjid };
      const m = path.match(/\/jobs\/(\d+)/);
      if (m) return { site: "greenhouse", idType: "jobId", needle: m[1] };
    }

    // 4) Lever: jobs.lever.co/<company>/<slug...>
    if (host === "jobs.lever.co") {
      const parts = path.split("/").filter(Boolean);
      if (parts.length >= 2) {
        const slug = parts.slice(1).join("/"); // everything after company name
        return { site: "lever", idType: "slug", needle: slug };
      }
    }

    // 5) Workday: ?jobReqId= / ?jobPostingId= / sometimes R-12345 in URL
    if (host.endsWith("myworkdayjobs.com")) {
      const jrid = qp.get("jobReqId") || qp.get("jobPostingId");
      if (jrid) return { site: "workday", idType: "jobReqId", needle: jrid };
      const m = u.match(/(?:^|[^\w])(R|JR)-\d{3,}/i) || path.match(/-(\d{5,})/);
      if (m) return { site: "workday", idType: "req", needle: (m[0] || m[1]).replace(/^[^\w]/, "") };
    }

    // 6) Workable: /j/<ID>
    if (host.endsWith("workable.com")) {
      const m = path.match(/\/j\/([A-Z0-9]+)/i);
      if (m) return { site: "workable", idType: "jobKey", needle: m[1] };
    }

    // 7) SmartRecruiters: last dash-number
    if (host.endsWith("smartrecruiters.com")) {
      const m = path.match(/-([0-9]{7,})$/);
      if (m) return { site: "smartrecruiters", idType: "jobId", needle: m[1] };
    }

    // 8) Teamtailor: /jobs/<id>
    if (host.endsWith("teamtailor.com")) {
      const m = path.match(/\/jobs\/(\d+)/);
      if (m) return { site: "teamtailor", idType: "jobId", needle: m[1] };
    }

    // 9) Breezy: /p/<postId>
    if (host.endsWith("breezy.hr")) {
      const m = path.match(/\/p\/([a-z0-9]+)/i);
      if (m) return { site: "breezy", idType: "postId", needle: m[1] };
    }

    // 10) UnitedHealth Group: /job/<digits>/
    if (host.endsWith("unitedhealthgroup.com")) {
      const m = path.match(/\/job\/(\d+)\//);
      if (m) return { site: "unitedhealthgroup", idType: "jobId", needle: m[1] };
    }

    // 11) iCIMS: /jobs/<digits>/job
    if (host.endsWith("icims.com")) {
      const m = path.match(/\/jobs\/(\d+)\//);
      if (m) return { site: "icims", idType: "jobId", needle: m[1] };
    }

    // Fallback: last non-empty path segment
    const segments = path.split("/").filter(Boolean);
    const tail = segments.pop();
    if (tail) return { site: "generic", idType: "slug", needle: tail };

    return null;
  }

  async function run() {
    const url = location.href;
    const fp = getJobFingerprint(url);

    if (!fp) {
      const text = [
        "JOB FINGERPRINT CHECK",
        `URL: ${url}`,
        "Fingerprint: (none found)",
        "Visited in history: N/A",
        "Bookmarked: N/A"
      ].join("\n");
      await copyToClipboard(text);
      return;
    }

    // Ask background to check bookmarks + history using the fingerprint "needle"
    chrome.runtime.sendMessage({ type: "CHECK_FINGERPRINT", needle: fp.needle, meta: fp, url }, async (res) => {
      if (!res || !res.ok) {
        const text = `JOB FINGERPRINT CHECK\nURL: ${url}\n${fp.site}:${fp.idType}=${fp.needle}\nError: ${res && res.error ? res.error : "Unknown error"}`;
        await copyToClipboard(text);
        return;
      }
      console.log(res);
      console.log(fp)
      const visited = res.historyCount > 0;
      const bookmarked = res.bookmarkCount > 0;

      const lines = [
        "JOB FINGERPRINT CHECK",
        // `URL: ${res.url}`,
        // `Fingerprint: ${fp.site}:${fp.idType}=${fp.needle}`,
        // `Visited in history: ${visited ? "YES" : "NO"}${res.lastVisit ? " (last: " + res.lastVisit + ")" : ""}`,
        // `Bookmarked: ${bookmarked ? "YES" : "NO"} (matches: ${res.bookmarkCount})`
        `Bookmarked: ${bookmarked ? "YES" : "NO"}`
      ];
      console.log(lines);
      await copyToClipboard(lines.join("\n"));
    });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    run();
  } else {
    document.addEventListener("DOMContentLoaded", run);
  }
})();
