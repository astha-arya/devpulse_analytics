const { nanoid } = require('nanoid');
const bcrypt = require('bcryptjs');
const geoip = require('geoip-lite');
const crypto = require('crypto');
const Redis = require('ioredis');
const Url = require('../models/Url');

// In-memory cache for faster lookups (optional but recommended)
const urlCache = new Map();

// ---------------------------------------------------------------------------
// Phase 4: Redis client — graceful degradation if Redis is unavailable.
// Rate limiting is skipped (not enforced) when Redis is down so the app
// keeps serving redirects even without a Redis connection.
// ---------------------------------------------------------------------------
let redis = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    // Disable ioredis auto-reconnect spamming the logs when Redis is absent
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  redis.on('error', (err) => {
    // Log once; ioredis will keep retrying in the background
    console.warn('[Redis] Connection error — rate limiting disabled:', err.message);
  });

  // Attempt the initial connection (non-blocking)
  redis.connect().catch(() => {
    console.warn('[Redis] Could not connect on startup — rate limiting disabled.');
  });
} catch (err) {
  console.warn('[Redis] Failed to initialise client — rate limiting disabled:', err.message);
  redis = null;
}

// ---------------------------------------------------------------------------
// Phase 4 helpers
// ---------------------------------------------------------------------------

// Sliding-window rate limiter: max `limit` hits per `windowSecs` seconds.
// Returns true if the request should be blocked, false if it's fine.
const isRateLimited = async (key, limit = 100, windowSecs = 60) => {
  if (!redis || redis.status !== 'ready') return false; // Redis down → allow

  try {
    const now = Date.now();
    const windowStart = now - windowSecs * 1000;

    // Use a sorted set: member = timestamp (ms), score = timestamp (ms)
    const pipe = redis.pipeline();
    pipe.zremrangebyscore(key, '-inf', windowStart);   // remove old entries
    pipe.zadd(key, now, `${now}-${Math.random()}`);    // add current hit
    pipe.zcard(key);                                    // count hits in window
    pipe.expire(key, windowSecs);                       // auto-expire key
    const results = await pipe.exec();

    const count = results[2][1]; // zcard result
    return count > limit;
  } catch (err) {
    console.warn('[Redis] Rate limit check failed:', err.message);
    return false; // Fail open — don't block on Redis errors
  }
};

// SHA-256 fingerprint of IP + User-Agent
const buildFingerprint = (ip, userAgent) => {
  return crypto
    .createHash('sha256')
    .update(`${ip}:${userAgent}`)
    .digest('hex');
};

// Helper: resolve the real client IP, stripping IPv6-mapped IPv4 prefixes
// so that geoip-lite (which expects plain IPv4) can look them up correctly.
const resolveIp = (req) => {
  const raw = req.ip || req.connection.remoteAddress || 'unknown';
  // Strip IPv6-mapped IPv4 prefix "::ffff:"
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

// @desc    Create a short URL
// @route   POST /api/shorten
// @access  Private
const shortenUrl = async (req, res) => {
  try {
    const { originalUrl, customAlias, expiresAt, maxClicks, password } = req.body;

    // Validation
    if (!originalUrl) {
      return res.status(400).json({ error: 'Original URL is required' });
    }

    // Validate URL format
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlPattern.test(originalUrl)) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Ensure URL has protocol
    const formattedUrl = originalUrl.startsWith('http') 
      ? originalUrl 
      : `https://${originalUrl}`;

    // Generate short ID
    let shortId;
    if (customAlias) {
      // Check if custom alias is available
      const existing = await Url.findOne({ shortId: customAlias });
      if (existing) {
        return res.status(400).json({ error: 'Custom alias already taken' });
      }
      shortId = customAlias;
    } else {
      shortId = nanoid(7); // Generates 7-character ID
      
      // Ensure uniqueness
      let attempts = 0;
      while (await Url.findOne({ shortId }) && attempts < 5) {
        shortId = nanoid(7);
        attempts++;
      }
    }

    // Hash password if provided
    let hashedPassword = null;
    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    // Create URL document
    const url = await Url.create({
      shortId,
      originalUrl: formattedUrl,
      userId: req.user._id,
      expiresAt: expiresAt || null,
      maxClicks: maxClicks || null,
      password: hashedPassword
    });

    // Add to cache
    urlCache.set(shortId, formattedUrl);

    const shortUrl = `${process.env.BASE_URL}/${shortId}`;

    res.status(201).json({
      success: true,
      message: 'Short URL created successfully',
      data: {
        shortId: url.shortId,
        shortUrl,
        originalUrl: url.originalUrl,
        createdAt: url.createdAt,
        totalClicks: 0
      }
    });
  } catch (error) {
    console.error('Shorten URL error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages[0] });
    }
    
    res.status(500).json({ error: 'Server error while creating short URL' });
  }
};

// @desc    Redirect to original URL and log analytics
// @route   GET /:shortId
// @access  Public
const redirectUrl = async (req, res) => {
  try {
    const { shortId } = req.params;

    // Check cache first for originalUrl
    let originalUrl = urlCache.get(shortId);
    let url;

    if (!originalUrl) {
      // Cache miss - query database
      url = await Url.findOne({ shortId });
      
      if (!url) {
        return res.status(404).json({ error: 'Short URL not found' });
      }

      originalUrl = url.originalUrl;
      urlCache.set(shortId, originalUrl);
    } else {
      // Still need to fetch the full object for analytics and expiry/password checks
      url = await Url.findOne({ shortId });
    }

    // 1. Expiry check — date-based
    const now = new Date();
    if (url.expiresAt && url.expiresAt < now) {
      return res.status(410).json({ error: 'This link has expired.' });
    }

    // 2. Expiry check — click-count-based
    if (url.maxClicks !== null && url.clicks.length >= url.maxClicks) {
      return res.status(410).json({ error: 'This link has expired.' });
    }

    // 3. Password gate check — redirect to frontend password page
    if (url.password) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      // Include query parameters in the redirect so we don't lose UTMs!
      const queryString = Object.keys(req.query).length > 0 ? `?${new URLSearchParams(req.query).toString()}` : '';
      return res.redirect(`${frontendUrl}/p/${req.params.shortId}${queryString}`);
    }

    // --- Phase 2: Parse UTM parameters from query string ---
    const {
      utm_source = null,
      utm_medium = null,
      utm_campaign = null,
      utm_term = null,
      utm_content = null
    } = req.query;

    // --- Phase 3: Geo-locate the client IP ---
    const clientIp = resolveIp(req);
    // const clientIp = '14.139.161.31'; // <-- For testing geo-location with a known IP address
    const geo = geoip.lookup(clientIp);
    const country = (geo && geo.country) ? geo.country : null;
    const city    = (geo && geo.city)    ? geo.city    : null;

    // --- Phase 4: Rate limiting ---
    const rateLimitKey = `rate_limit:${shortId}:${clientIp}`;
    const blocked = await isRateLimited(rateLimitKey, 100, 60);
    if (blocked) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }

    // --- Phase 4: Fingerprinting & unique visitor detection ---
    const userAgentStr = req.get('user-agent') || 'unknown';
    const fingerprint = buildFingerprint(clientIp, userAgentStr);
    const isUnique = !url.clicks.some((c) => c.fingerprint === fingerprint);

    // Log click analytics
    const clickData = {
      ip: clientIp,
      userAgent: userAgentStr,
      referrer: req.get('referer') || req.get('referrer') || 'direct',
      timestamp: new Date(),
      // Phase 2
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      // Phase 3
      country,
      city,
      // Phase 4
      fingerprint,
      isUnique
    };

    // Update clicks array (async, don't wait)
    Url.findOneAndUpdate(
      { shortId },
      { $push: { clicks: clickData } },
      { new: true }
    ).catch(err => console.error('Error logging click:', err));

    // Redirect
    res.redirect(302, originalUrl);
  } catch (error) {
    console.error('Redirect error:', error);
    res.status(500).json({ error: 'Server error during redirect' });
  }
};

// @desc    Verify Password and Return Original URL
// @route   POST /api/:shortId/verify
// @access  Public
const verifyPasswordAndRedirect = async (req, res) => {
  try {
    const { shortId } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const url = await Url.findOne({ shortId });

    if (!url) {
      return res.status(404).json({ error: 'Short link not found' });
    }

    // Re-run expiry checks
    const now = new Date();
    if (url.expiresAt && url.expiresAt < now) {
      return res.status(410).json({ error: 'This link has expired.' });
    }
    if (url.maxClicks !== null && url.clicks.length >= url.maxClicks) {
      return res.status(410).json({ error: 'This link has expired.' });
    }

    // Compare supplied plaintext password against stored hash
    const isMatch = await bcrypt.compare(password, url.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    // Parse UTM parameters from query string (if passed from frontend)
    const {
      utm_source = null,
      utm_medium = null,
      utm_campaign = null,
      utm_term = null,
      utm_content = null
    } = req.query;

    // --- Phase 3: Geo-locate the client IP ---
    const clientIp = resolveIp(req);
    const geo = geoip.lookup(clientIp);
    const country = (geo && geo.country) ? geo.country : null;
    const city    = (geo && geo.city)    ? geo.city    : null;

    // --- Phase 4: Rate limiting ---
    const rateLimitKey = `rate_limit:${shortId}:${clientIp}`;
    const blocked = await isRateLimited(rateLimitKey, 100, 60);
    if (blocked) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }

    // --- Phase 4: Fingerprinting & unique visitor detection ---
    const userAgentStr = req.get('user-agent') || 'unknown';
    const fingerprint = buildFingerprint(clientIp, userAgentStr);
    const isUnique = !url.clicks.some((c) => c.fingerprint === fingerprint);

    // Password correct — record click using your existing analytics structure
    const clickData = {
      ip: clientIp,
      userAgent: userAgentStr,
      referrer: req.get('referer') || req.get('referrer') || 'direct',
      timestamp: new Date(),
      // Phase 2
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      // Phase 3
      country,
      city,
      // Phase 4
      fingerprint,
      isUnique
    };

    Url.findOneAndUpdate(
      { shortId },
      { $push: { clicks: clickData } },
      { new: true }
    ).catch(err => console.error('Error logging click:', err));

    // Return original URL for frontend to redirect
    return res.status(200).json({ originalUrl: url.originalUrl });

  } catch (error) {
    console.error('Verify password error:', error);
    res.status(500).json({ error: 'Server error during password verification' });
  }
};

// @desc    Get all links for logged-in user
// @route   GET /api/links
// @access  Private
const getUserLinks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const urls = await Url.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Url.countDocuments({ userId: req.user._id });

    const urlsWithData = urls.map(url => ({
      shortId: url.shortId,
      originalUrl: url.originalUrl,
      shortUrl: `${process.env.BASE_URL}/${url.shortId}`,
      totalClicks: url.clicks ? url.clicks.length : 0,
      createdAt: url.createdAt
    }));

    res.status(200).json({
      success: true,
      data: urlsWithData,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalLinks: total,
        hasMore: skip + urls.length < total
      }
    });
  } catch (error) {
    console.error('Get user links error:', error);
    res.status(500).json({ error: 'Server error while fetching links' });
  }
};

// @desc    Get analytics for a specific link
// @route   GET /api/analytics/:shortId
// @access  Private
const getAnalytics = async (req, res) => {
  try {
    const { shortId } = req.params;

    const url = await Url.findOne({ 
      shortId, 
      userId: req.user._id 
    });

    if (!url) {
      return res.status(404).json({ error: 'Link not found or unauthorized' });
    }

    // Calculate analytics
    const totalClicks = url.clicks.length;

    // --- Phase 4: Unique clicks ---
    const uniqueClicks = url.clicks.filter((c) => c.isUnique === true).length;
    
    // Group clicks by date
    const clicksByDate = {};
    url.clicks.forEach(click => {
      const date = click.timestamp.toISOString().split('T')[0];
      clicksByDate[date] = (clicksByDate[date] || 0) + 1;
    });

    // Group by browser/device (basic parsing of user agent)
    const devices = {};
    url.clicks.forEach(click => {
      const ua = click.userAgent.toLowerCase();
      let device = 'Other';
      
      if (ua.includes('mobile')) device = 'Mobile';
      else if (ua.includes('tablet')) device = 'Tablet';
      else if (ua.includes('windows') || ua.includes('mac') || ua.includes('linux')) device = 'Desktop';
      
      devices[device] = (devices[device] || 0) + 1;
    });

    // Recent clicks
    const recentClicks = url.clicks
      .slice(-10)
      .reverse()
      .map(click => ({
        ip: click.ip,
        userAgent: click.userAgent,
        referrer: click.referrer,
        timestamp: click.timestamp
      }));

    // --- Phase 3: Group clicks by country code ---
    // Produces e.g. { "US": 150, "IN": 85, "GB": 12, "Unknown": 5 }
    const locations = {};
    url.clicks.forEach(click => {
      const code = click.country || 'Unknown';
      locations[code] = (locations[code] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      data: {
        shortId: url.shortId,
        originalUrl: url.originalUrl,
        shortUrl: `${process.env.BASE_URL}/${url.shortId}`,
        createdAt: url.createdAt,
        analytics: {
          totalClicks,
          uniqueClicks,   // <-- Phase 4 addition
          clicksByDate,
          deviceBreakdown: devices,
          recentClicks,
          locations
        }
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Server error while fetching analytics' });
  }
};

// @desc    Delete a short link
// @route   DELETE /api/links/:shortId
// @access  Private
const deleteLink = async (req, res) => {
  try {
    const { shortId } = req.params;

    const url = await Url.findOneAndDelete({ 
      shortId, 
      userId: req.user._id 
    });

    if (!url) {
      return res.status(404).json({ error: 'Link not found or unauthorized' });
    }

    // Remove from cache
    urlCache.delete(shortId);

    res.status(200).json({
      success: true,
      message: 'Link deleted successfully'
    });
  } catch (error) {
    console.error('Delete link error:', error);
    res.status(500).json({ error: 'Server error while deleting link' });
  }
};

module.exports = {
  shortenUrl,
  redirectUrl,
  getUserLinks,
  getAnalytics,
  deleteLink,
  verifyPasswordAndRedirect
};