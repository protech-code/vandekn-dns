// 1.  IN-MEMORY RAM CACHE
const memoryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // cache saving: 5 minutes (300,000 ms)

const BLOCKLIST_SOURCES = [
  "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt",
  "https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/pro.plus.txt",
  "https://abpvn.com/filter/abpvn-CQBeH5.txt"
];

const WHITELIST_SOURCES = [
  "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/whitelist-referral.txt",
  "https://raw.githubusercontent.com/anudeepND/whitelist/master/domains/whitelist.txt",
  "https://raw.githubusercontent.com/8technologia/adguardhome/refs/heads/main/allowlists.txt"
];

// List of upstream DNS servers for DoH (DNS over HTTPS)
const UPSTREAMS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/dns-query"
];

let cachedSet = null;
let lastCacheTime = 0;

// 2. WORKER MAIN HANDLER
export default {
  // Cron job: automatically update blocklists 
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateBlocklists(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Home /
    if (url.pathname === "/") {
      return new Response(" Vandekn DNS is ACTIVE!", { status: 200 });
    }

    // 2. update
    if (url.pathname === "/update") {
      ctx.waitUntil(updateBlocklists(env));
      return new Response("Automated update process for Blocklists and Whitelists in KV has been activated!", { status: 200 });
    }

    // 3. Link DoH /dns-query
    if (url.pathname !== "/dns-query") {
      return new Response("404 Not Found", { status: 404 });
    }

    if (request.method === "GET" && !url.searchParams.has("dns")) {
      return new Response(JSON.stringify({ Status: 0, Comment: "dns-query" }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*"
        }
      });
    }

    const cacheKey = request.url;
    if (request.method === "GET" && memoryCache.has(cacheKey)) {
      const cachedItem = memoryCache.get(cacheKey);

   
      if (Date.now() - cachedItem.timestamp < CACHE_TTL) {
        return new Response(cachedItem.buffer, {
          status: cachedItem.status,
          headers: {
            ...cachedItem.headers,
            "access-control-allow-origin": "*"
          }
        });
      } else {
        memoryCache.delete(cacheKey);
      }
    }


    const blockSet = await getBlocklistFromKV(env);

    let dnsBuffer = null;
    if (request.method === "GET") {
      const dnsParam = url.searchParams.get("dns");
      if (dnsParam) dnsBuffer = base64UrlToBuffer(dnsParam);
    } else if (request.method === "POST") {
      dnsBuffer = await request.arrayBuffer();
    }

    // Check domain against blocklist
    if (dnsBuffer) {
      const qname = extractQName(dnsBuffer);

      if (qname && isDomainBlocked(qname, blockSet)) {
        // Trả về NXDOMAIN ngay lập tức nếu bị chặn
        return new Response(createNxdomainResponse(dnsBuffer), {
          headers: {
            "content-type": "application/dns-message",
            "access-control-allow-origin": "*"
          }
        });
      }
    }

    let upstreamResponse = null;
    const searchParams = request.method === "GET" ? url.search : "";

    // Hàm gửi request song song
    const fetchUpstream = async (upstreamUrl) => {
      const res = await fetch(upstreamUrl + searchParams, {
        method: request.method,
        headers: {
          "accept": "application/dns-message",
          "content-type": "application/dns-message"
        },
        body: request.method === "POST" ? dnsBuffer : null
      });
      if (res.ok) return res;
      throw new Error("DNS upstream failed");
    };

    try {
      upstreamResponse = await Promise.race(UPSTREAMS.map(url => fetchUpstream(url)));
    } catch (err) {
      upstreamResponse = await fetchUpstream(UPSTREAMS[0]);
    }


    const responseBuffer = await upstreamResponse.arrayBuffer();
    const responseHeaders = {
      "content-type": "application/dns-message",
      "access-control-allow-origin": "*"
    };

    if (upstreamResponse.status === 200 && request.method === "GET") {
      if (memoryCache.size > 2000) {
        const firstKeys = Array.from(memoryCache.keys()).slice(0, 500);
        firstKeys.forEach(k => memoryCache.delete(k));
      }

      memoryCache.set(cacheKey, {
        buffer: responseBuffer,
        status: upstreamResponse.status,
        headers: responseHeaders,
        timestamp: Date.now()
      });
    }

    return new Response(responseBuffer, {
      status: upstreamResponse.status,
      headers: responseHeaders
    });
  }
};


async function updateBlocklists(env) {
  console.log("Starting to download Blocklist sources...");
  const mergedBlockSet = new Set();

  const blockResults = await Promise.allSettled(
    BLOCKLIST_SOURCES.map(url => fetch(url).then(r => r.ok ? r.text() : ""))
  );

  for (const res of blockResults) {
    if (res.status === "fulfilled" && res.value) {
      const domains = parseAnyList(res.value);
      domains.forEach(d => mergedBlockSet.add(d));
    }
  }

  console.log("Starting to download WhiteList sources...");
  const mergedWhitelistSet = new Set();

  const whiteResults = await Promise.allSettled(
    WHITELIST_SOURCES.map(url => fetch(url).then(r => r.ok ? r.text() : ""))
  );

  for (const res of whiteResults) {
    if (res.status === "fulfilled" && res.value) {
      const domains = parseAnyList(res.value);
      domains.forEach(d => mergedWhitelistSet.add(d));
    }
  }

  if (env.ADBLOCK_KV) {
    const rawKvWhitelist = await env.ADBLOCK_KV.get("WHITELIST") || "";
    const kvWhitelistDomains = parseAnyList(rawKvWhitelist);
    kvWhitelistDomains.forEach(d => mergedWhitelistSet.add(d));
  }

  let removedCount = 0;
  for (const allowedDomain of mergedWhitelistSet) {
    if (mergedBlockSet.has(allowedDomain)) {
      mergedBlockSet.delete(allowedDomain);
      removedCount++;
    }
  }

  const finalDomainsArray = Array.from(mergedBlockSet);
  if (env.ADBLOCK_KV) {
    await env.ADBLOCK_KV.put("MERGED_BLOCKLIST", finalDomainsArray.join("\n"));
  }
  console.log(`Done! Total remaining blocked domains in KV: ${finalDomainsArray.length}`);
}

function parseAnyList(text) {
  const domains = new Set();
  if (!text) return domains;

  const lines = text.split("\n");

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;

    line = line.replace(/^@@\|\|/, "").replace(/^\|\|/, "");

    const caretIdx = line.indexOf("^");
    if (caretIdx !== -1) {
      line = line.substring(0, caretIdx);
    }

    const parts = line.split(/\s+/);
    let domain = parts.length > 1 ? parts[1] : parts[0];
    domain = domain.toLowerCase().trim();

    if (isValidDomain(domain)) {
      domains.add(domain);
    }
  }
  return domains;
}

function isValidDomain(domain) {
  return domain && domain.includes(".") && !domain.startsWith("localhost") && !domain.startsWith("127.0.0.1");
}

async function getBlocklistFromKV(env) {
  if (cachedSet && (Date.now() - lastCacheTime < 3600000)) {
    return cachedSet;
  }
  if (!env.ADBLOCK_KV) return new Set();
  const rawText = await env.ADBLOCK_KV.get("MERGED_BLOCKLIST");
  if (!rawText) return new Set();

  cachedSet = new Set(rawText.split("\n"));
  lastCacheTime = Date.now();
  return cachedSet;
}

function isDomainBlocked(qname, blockSet) {
  const parts = qname.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (blockSet.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

function extractQName(buffer) {
  try {
    const view = new DataView(buffer);
    let offset = 12;
    const labels = [];
    while (offset < buffer.byteLength) {
      const len = view.getUint8(offset);
      if (len === 0) break;
      offset++;
      const labelBytes = new Uint8Array(buffer, offset, len);
      labels.push(new TextDecoder().decode(labelBytes));
      offset += len;
    }
    return labels.join(".").toLowerCase();
  } catch {
    return null;
  }
}

function createNxdomainResponse(buffer) {
  const res = new Uint8Array(buffer.slice(0));
  res[2] = 0x81;
  res[3] = 0x83;
  return res;
}

function base64UrlToBuffer(base64url) {
  let b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}