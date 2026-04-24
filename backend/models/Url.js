const mongoose = require('mongoose');

const clickSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  referrer: {
    type: String,
    default: ''
  },
  // --- Phase 2: UTM Parameter Fields ---
  utm_source: {
    type: String,
    default: null
  },
  utm_medium: {
    type: String,
    default: null
  },
  utm_campaign: {
    type: String,
    default: null
  },
  utm_term: {
    type: String,
    default: null
  },
  utm_content: {
    type: String,
    default: null
  },
  // --- Phase 3: Geographic Fields ---
  country: {
    type: String,
    default: null
  },
  city: {
    type: String,
    default: null
  },
  // --- Phase 4: Fingerprint & Unique Visitor Fields ---
  fingerprint: {
    type: String,
    default: null
  },
  isUnique: {
    type: Boolean,
    default: true
  }
});

const urlSchema = new mongoose.Schema({
  shortId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  originalUrl: {
    type: String,
    required: [true, 'Original URL is required'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(v);
      },
      message: 'Please enter a valid URL'
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clicks: {
    type: [clickSchema],
    default: [] 
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: null
  },
  // --- Phase 1 Fields ---
  maxClicks: {
    type: Number,
    default: null
  },
  password: {
    type: String,
    default: null
  }
});

// Indexes for performance
urlSchema.index({ userId: 1 });
urlSchema.index({ createdAt: -1 });

// Virtual for total clicks
urlSchema.virtual('totalClicks').get(function() {
  return this.clicks ? this.clicks.length : 0;
});

// Ensure virtuals are included in JSON
urlSchema.set('toJSON', { virtuals: true });
urlSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Url', urlSchema);