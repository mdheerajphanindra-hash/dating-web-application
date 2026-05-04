const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const User = require('../models/User');
const Like = require('../models/Like');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Report = require('../models/Report');
const GENERATED_PROFILE_LIBRARY = require('../data/generatedProfiles');

const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@campusmatch.local';
const DAILY_LIKE_LIMIT = Number(process.env.DAILY_LIKE_LIMIT || 15);
const PREMIUM_LIKE_LIMIT = Number(process.env.PREMIUM_DAILY_LIKE_LIMIT || 60);
const DISCOVER_PAGE_SIZE = Number(process.env.DISCOVER_PAGE_SIZE || 24);
const AUTO_MATCH_TARGET = Number(process.env.AUTO_MATCH_TARGET || 6);
const BOOST_DURATION_MS = 30 * 60 * 1000;
const ICEBREAKER_PROMPTS = [
  'What is your dream trip destination?',
  'Coffee or tea and why?',
  'What is one hobby you can talk about for hours?',
  'Would you pick mountains, beaches, or city lights?',
  'What is your perfect late-night plan?'
];
const ALLOWED_INTERESTS = [
  'Music', 'Movies', 'Web Series', 'Anime',
  'Fitness', 'Yoga', 'Gym', 'Meditation',
  'Traveling', 'Hiking', 'Adventure', 'Photography',
  'Coding', 'Reading', 'Writing', 'Startups',
  'Cooking', 'Foodie', 'Coffee', 'Street Food',
  'Gaming', 'Drawing', 'Dancing', 'Singing'
];
const INTEREST_NAME_MAP = new Map(ALLOWED_INTERESTS.map((interest) => [interest.toLowerCase(), interest]));
const QUICK_REPLY_BANK = {
  friendly: ['That sounds fun', 'Tell me more about that', 'I would actually love that too'],
  funny: ['That is unexpectedly iconic', 'Okay, that answer wins', 'You might be trouble and I respect it'],
  flirty: ['You are making this conversation easy', 'That is a very attractive answer', 'I would swipe right again for that']
};
const MODERATION_PATTERNS = [/hate/i, /abuse/i, /kill/i, /nude/i, /scam/i, /(.)\1{7,}/i];

let mailTransporterPromise = null;
let socketIo = null;

function setSocketIo(io) {
  socketIo = io;
}

function getSocketIo() {
  return socketIo;
}

function createOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildIdentityQuery(email, phone) {
  const options = [
    ...(email ? [{ email: String(email).toLowerCase() }] : []),
    ...(phone ? [{ phone: String(phone) }] : [])
  ];
  return options.length ? { $or: options } : null;
}

async function getMailTransporter() {
  if (mailTransporterPromise) {
    return mailTransporterPromise;
  }

  mailTransporterPromise = (async () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return null;
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.verify();
    return transporter;
  })().catch((error) => {
    console.error('Email transporter setup failed:', error.message);
    mailTransporterPromise = null;
    return null;
  });

  return mailTransporterPromise;
}

async function sendResetPasswordEmail(toEmail, otpCode) {
  if (!toEmail) {
    return { delivered: false, reason: 'missing_email' };
  }

  const transporter = await getMailTransporter();
  if (!transporter) {
    return { delivered: false, reason: 'mail_not_configured' };
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to: toEmail,
    subject: 'CampusMatch password reset code',
    text: `Your CampusMatch password reset code is ${otpCode}. It expires in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
        <h2 style="margin-bottom: 12px;">CampusMatch password reset</h2>
        <p>Use this code to reset your password:</p>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 18px 0;">${otpCode}</div>
        <p>This code expires in 10 minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `
  });

  return { delivered: true };
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const value = user.toObject ? user.toObject() : { ...user };
  delete value.password;
  delete value.otpCode;
  delete value.otpExpiresAt;
  delete value.resetOtpCode;
  delete value.resetOtpExpiresAt;
  return value;
}

function calculateAgeFromBirthDate(birthDate) {
  if (!birthDate) {
    return null;
  }

  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDelta = today.getMonth() - date.getMonth();
  const needsAdjustment = monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate());

  if (needsAdjustment) {
    age -= 1;
  }

  return Math.max(18, age);
}

function isOnboardingComplete(user) {
  const photoCount = Array.isArray(user.photos) ? user.photos.filter(Boolean).length : 0;
  const bioLength = String(user.bio || '').trim().length;
  const interestCount = Array.isArray(user.interests) ? user.interests.length : 0;

  return Boolean(
    String(user.name || '').trim() &&
    user.age >= 18 &&
    user.gender &&
    user.interestedIn &&
    String(user.location || '').trim() &&
    bioLength >= 20 &&
    interestCount >= 3 &&
    photoCount >= 2
  );
}

function normalizeInterestList(interests) {
  const rawItems = !interests
    ? []
    : Array.isArray(interests)
      ? interests
      : String(interests).split(',');

  return [...new Set(
    rawItems
      .map((item) => INTEREST_NAME_MAP.get(String(item).trim().toLowerCase()))
      .filter(Boolean)
  )];
}

function normalizePhotoList(photos, limit = null) {
  const normalized = [...new Set(
    (Array.isArray(photos) ? photos : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )];

  return typeof limit === 'number' ? normalized.slice(0, limit) : normalized;
}

function hasIntentionalBlankPhoto(photos) {
  return Array.isArray(photos) && photos.some((item) => String(item || '').trim() === '');
}

function sameDay(dateA, dateB) {
  if (!dateA || !dateB) {
    return false;
  }

  return new Date(dateA).toDateString() === new Date(dateB).toDateString();
}

function dayDiff(dateA, dateB) {
  const first = new Date(dateA);
  const second = new Date(dateB);
  const firstDay = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const secondDay = new Date(second.getFullYear(), second.getMonth(), second.getDate());
  return Math.round((secondDay - firstDay) / (24 * 60 * 60 * 1000));
}

function updateStreak(user) {
  const today = new Date();

  if (!user.lastLoginDate) {
    user.streakCount = 1;
    user.points += 5;
  } else if (!sameDay(user.lastLoginDate, today)) {
    const difference = dayDiff(user.lastLoginDate, today);
    user.streakCount = difference === 1 ? user.streakCount + 1 : 1;
    user.points += difference === 1 ? 5 : 2;
  }

  user.lastLoginDate = today;
  user.lastSeenAt = today;
  user.activityScore = Math.min(100, user.streakCount * 6 + user.points / 4);
}

function matchesPreference(currentUser, candidate) {
  const userInterestedIn = currentUser.interestedIn === 'Everyone' || currentUser.interestedIn === candidate.gender;
  const candidateInterestedIn = candidate.interestedIn === 'Everyone' || candidate.interestedIn === currentUser.gender;
  return userInterestedIn && candidateInterestedIn;
}

function getOppositeGender(gender) {
  if (gender === 'Male') {
    return 'Female';
  }
  if (gender === 'Female') {
    return 'Male';
  }
  return null;
}

function shuffleList(items) {
  const values = [...items];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }
  return values;
}

function normalizeProfileDisplayName(name) {
  return String(name || '')
    .replace(/\s+(Campus|City Center|Downtown|Nearby|Guntur|Vijayawada|Kurnool|Tirupati|Amaravati|Anantapur|Kakinada|Ongole)$/i, '')
    .trim()
    .toLowerCase();
}

function rotateList(items = [], startIndex = 0) {
  if (!items.length) {
    return [];
  }

  const offset = ((startIndex % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function getGeneratedProfileEntries(targetGender) {
  const profiles = GENERATED_PROFILE_LIBRARY[targetGender] || GENERATED_PROFILE_LIBRARY.Other || [];
  if (!Array.isArray(profiles)) {
    return [];
  }

  const seenPrimaryPhotos = new Set();
  const dedupedProfiles = profiles.filter((entry) => {
    if (!entry) {
      return false;
    }

    const primaryPhoto = normalizePhotoList(entry.photos, 1)[0];
    if (!primaryPhoto) {
      return true;
    }

    if (seenPrimaryPhotos.has(primaryPhoto)) {
      return false;
    }

    seenPrimaryPhotos.add(primaryPhoto);
    return true;
  });

  if (targetGender === 'Male') {
    const prioritizedNames = ['Mayank Sagar'];
    const prioritizedEntries = prioritizedNames
      .map((name) => dedupedProfiles.find((entry) => entry.name === name))
      .filter(Boolean);
    const remainingEntries = dedupedProfiles.filter((entry) => !prioritizedNames.includes(entry.name));
    return [...prioritizedEntries, ...remainingEntries];
  }

  return dedupedProfiles;
}

function getGenderPhotoPool(targetGender) {
  return normalizePhotoList(
    getGeneratedProfileEntries(targetGender).flatMap((entry) => Array.isArray(entry.photos) ? entry.photos : [])
  );
}

function buildGeneratedPhotoSet(targetGender, preferredPhotos = [], startIndex = 0, limit = 1) {
  if (hasIntentionalBlankPhoto(preferredPhotos)) {
    return [''].slice(0, limit);
  }

  const pinnedPhotos = normalizePhotoList(preferredPhotos);
  const photoPool = getGenderPhotoPool(targetGender);

  if (!photoPool.length) {
    return pinnedPhotos.slice(0, limit);
  }

  const rotatedPool = rotateList(photoPool, startIndex).filter((photo) => !pinnedPhotos.includes(photo));
  return [...pinnedPhotos, ...rotatedPool].slice(0, limit);
}

function parseGeneratedProfileSeed(candidate) {
  const email = String(candidate.email || '');
  const match = email.match(/^generated-match-([a-z]+)-(\d+)(?:-(\d+))?@/i);

  if (!match) {
    return null;
  }

  return {
    genderKey: match[1],
    entryNumber: Math.max(1, Number(match[2] || 1)),
    variantNumber: Math.max(1, Number(match[3] || 1))
  };
}

function assignGeneratedPhotos(candidate) {
  if (!String(candidate.email || '').startsWith('generated-match-')) {
    return candidate;
  }

  const parsedSeed = parseGeneratedProfileSeed(candidate);
  const photoOffset = parsedSeed ? parsedSeed.entryNumber + parsedSeed.variantNumber - 2 : 0;
  const normalizedName = normalizeProfileDisplayName(candidate.name);
  const matchingEntry = getGeneratedProfileEntries(candidate.gender)
    .find((entry) => normalizeProfileDisplayName(entry.name) === normalizedName);

  if (matchingEntry?.photos?.length) {
    return {
      ...candidate,
      photos: buildGeneratedPhotoSet(candidate.gender, matchingEntry.photos, photoOffset)
    };
  }

  const photoPool = getGenderPhotoPool(candidate.gender);
  if (!photoPool.length) {
    return candidate;
  }

  return { ...candidate, photos: buildGeneratedPhotoSet(candidate.gender, candidate.photos || [], photoOffset) };
}

function getPreferredMatchGender(user) {
  if (user.interestedIn && user.interestedIn !== 'Everyone') {
    return user.interestedIn;
  }
  return null;
}

function buildGeneratedProfiles(targetGender, count = DISCOVER_PAGE_SIZE) {
  const orderedEntries = getGeneratedProfileEntries(targetGender);
  const entries = orderedEntries.length > 1
    ? [orderedEntries[0], ...shuffleList(orderedEntries.slice(1))]
    : orderedEntries;
  const baseLocations = ['Campus', 'City Center', 'Downtown', 'Nearby'];
  const interestPool = shuffleList(ALLOWED_INTERESTS);
  const total = Math.min(count, Math.max(0, entries.length));

  return Array.from({ length: total }, (_, index) => {
    const entry = entries[index % Math.max(1, entries.length)] || {};
    const startIndex = (index * 2) % Math.max(1, interestPool.length - 2);
    const interests = Array.isArray(entry.interests) && entry.interests.length
      ? entry.interests.slice(0, 4)
      : interestPool.slice(startIndex, startIndex + 3);
    const photos = buildGeneratedPhotoSet(
      targetGender,
      Array.isArray(entry.photos) && entry.photos.length
        ? entry.photos
        : getGeneratedProfileEntries('Other')[0]?.photos || [],
      index
    );

    return {
      _id: `generated-${targetGender}-${index + 1}`,
      otherUser: {
        _id: `generated-user-${targetGender}-${index + 1}`,
        name: entry.name || `${targetGender} Demo ${index + 1}`,
        age: entry.age || (21 + ((index * 3) % 8)),
        gender: targetGender,
        location: entry.location || baseLocations[index % baseLocations.length],
        bio: entry.bio || 'A demo profile added for discovery.',
        interests,
        photos
      },
      compatibilityScore: 72 + (index % 18),
      compatibilityReasons: [
        `Suggested ${targetGender.toLowerCase()} profile for your preferences`,
        `You both may enjoy ${interests.slice(0, 2).join(' and ')}`
      ],
      smartSuggestion: `A generated ${targetGender.toLowerCase()} profile picked to keep your matches page active.`,
      isSuggested: true,
      isVirtual: true
    };
  });
}

function parseGeneratedProfileIdentifier(identifier) {
  const value = String(identifier || '');
  const match = value.match(/^generated-user-([a-z]+)-(\d+)$/i);
  if (!match) {
    return null;
  }

  const genderToken = match[1].toLowerCase();
  const gender = genderToken === 'male'
    ? 'Male'
    : genderToken === 'female'
      ? 'Female'
      : 'Other';

  return {
    gender,
    index: Math.max(0, Number(match[2] || 1) - 1)
  };
}

async function resolveTargetUser(currentUser, userId, profilePreview = {}) {
  if (mongoose.Types.ObjectId.isValid(userId)) {
    const existingUser = await User.findById(userId);
    if (existingUser) {
      return existingUser;
    }
  }

  const generatedSeed = parseGeneratedProfileIdentifier(userId);
  if (!generatedSeed) {
    return null;
  }

  const targetGender = profilePreview.gender || generatedSeed.gender;
  const entries = getGeneratedProfileEntries(targetGender);
  const previewName = String(profilePreview.name || '').trim();
  const matchingEntryIndex = previewName
    ? entries.findIndex((entry) => String(entry.name || '').trim() === previewName)
    : -1;
  const resolvedIndex = matchingEntryIndex >= 0 ? matchingEntryIndex : generatedSeed.index;

  return createSyntheticMatchCandidate(currentUser, resolvedIndex, targetGender);
}

function buildGeneratedProfilesForGenders(targetGenders = [], count = DISCOVER_PAGE_SIZE) {
  const normalizedGenders = [...new Set(targetGenders.filter(Boolean))];

  if (!normalizedGenders.length || count < 1) {
    return [];
  }

  const genderBuckets = normalizedGenders.map((gender) => buildGeneratedProfiles(gender, count));
  const results = [];
  let bucketIndex = 0;

  while (results.length < count) {
    let appendedInRound = false;

    for (const bucket of genderBuckets) {
      const candidate = bucket[bucketIndex];
      if (!candidate) {
        continue;
      }

      results.push(candidate);
      appendedInRound = true;
      if (results.length >= count) {
        break;
      }
    }

    if (!appendedInRound) {
      break;
    }

    bucketIndex += 1;
  }

  return results;
}

function getProfileDeduplicationKey(profile) {
  if (!profile) {
    return null;
  }

  const email = String(profile.email || '');
  if (email.startsWith('generated-match-')) {
    const parsedSeed = parseGeneratedProfileSeed(profile);
    if (parsedSeed) {
      return `generated-seed:${parsedSeed.genderKey}:${parsedSeed.entryNumber}`;
    }
  }

  const profileId = String(profile._id || '');
  if (profileId) {
    return `id:${profileId}`;
  }

  const normalizedName = normalizeProfileDisplayName(profile.name);
  if (normalizedName) {
    return `name:${String(profile.gender || 'unknown').toLowerCase()}:${normalizedName}`;
  }

  return null;
}

function dedupeProfileCards(items, getProfile, seedItems = []) {
  const seenPrimaryPhotos = new Set();
  const seenProfileKeys = new Set();

  for (const seedItem of seedItems) {
    const seedProfile = getProfile(seedItem);
    const seedKey = getProfileDeduplicationKey(seedProfile);
    const seedPrimaryPhoto = normalizePhotoList(seedProfile?.photos, 1)[0];

    if (seedKey) {
      seenProfileKeys.add(seedKey);
    }

    if (seedPrimaryPhoto) {
      seenPrimaryPhotos.add(seedPrimaryPhoto);
    }
  }

  return items.filter((item) => {
    const profile = getProfile(item);
    const profileKey = getProfileDeduplicationKey(profile);
    const primaryPhoto = normalizePhotoList(profile?.photos, 1)[0];

    if (profileKey && seenProfileKeys.has(profileKey)) {
      return false;
    }

    if (primaryPhoto && seenPrimaryPhotos.has(primaryPhoto)) {
      return false;
    }

    if (profileKey) {
      seenProfileKeys.add(profileKey);
    }

    if (primaryPhoto) {
      seenPrimaryPhotos.add(primaryPhoto);
    }

    return true;
  });
}

function dedupeUsers(users, seedUsers = []) {
  return dedupeProfileCards(users, (user) => user, seedUsers);
}

function dedupeLikeItems(items, profileField) {
  return dedupeProfileCards(items, (item) => item?.[profileField]);
}

function orderPair(userA, userB) {
  const [first, second] = [userA.toString(), userB.toString()].sort();
  return { user1Id: first, user2Id: second };
}

function toRadians(value) {
  return value * (Math.PI / 180);
}

function getEffectiveLocation(user) {
  return user.travelModeEnabled && user.travelLocation ? user.travelLocation : user.location;
}

function calculateDistanceKm(userA, userB) {
  if (
    typeof userA.latitude === 'number' &&
    typeof userA.longitude === 'number' &&
    typeof userB.latitude === 'number' &&
    typeof userB.longitude === 'number'
  ) {
    const earthRadius = 6371;
    const dLat = toRadians(userB.latitude - userA.latitude);
    const dLng = toRadians(userB.longitude - userA.longitude);
    const lat1 = toRadians(userA.latitude);
    const lat2 = toRadians(userB.latitude);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(earthRadius * c);
  }

  const sameCity = getEffectiveLocation(userA).toLowerCase() === getEffectiveLocation(userB).toLowerCase();
  return sameCity ? 2 : 25;
}

function evaluateProfileQuality(user) {
  const photoCount = Array.isArray(user.photos) ? user.photos.length : 0;
  const bioLength = String(user.bio || '').trim().length;
  const interestCount = Array.isArray(user.interests) ? user.interests.length : 0;

  let score = 0;
  if (photoCount >= 2) {
    score += 40;
  } else if (photoCount === 1) {
    score += 15;
  }
  if (bioLength >= 20) {
    score += 25;
  }
  if (interestCount >= 3) {
    score += 15;
  }
  if (user.education || user.job) {
    score += 10;
  }
  if (user.personalityAnswers?.datingIntent) {
    score += 10;
  }

  return {
    qualityScore: score,
    qualityVisible: photoCount >= 2 && bioLength >= 20
  };
}

function applyProfileQuality(user) {
  const quality = evaluateProfileQuality(user);
  user.qualityScore = quality.qualityScore;
  user.qualityVisible = quality.qualityVisible;
}

function calculateCompatibility(currentUser, candidate) {
  const sharedInterests = (candidate.interests || []).filter((interest) => currentUser.interests?.includes(interest));
  const personalityKeys = ['socialStyle', 'scheduleStyle', 'datingIntent', 'communicationStyle', 'weekendStyle'];
  const personalityMatches = personalityKeys.filter((key) => {
    const current = currentUser.personalityAnswers?.[key];
    const target = candidate.personalityAnswers?.[key];
    return current && target && current === target;
  });
  const distanceKm = calculateDistanceKm(currentUser, candidate);
  const activityDelta = Math.abs((currentUser.activityScore || 0) - (candidate.activityScore || 0));

  let score = 35;
  score += Math.min(30, sharedInterests.length * 10);
  score += Math.min(25, personalityMatches.length * 5);
  score += Math.max(0, 15 - Math.min(15, activityDelta / 4));
  score += distanceKm <= 5 ? 10 : distanceKm <= 15 ? 6 : 2;
  if (candidate.boostedUntil && new Date(candidate.boostedUntil) > new Date()) {
    score += 8;
  }

  const reasons = [];
  if (sharedInterests.length) {
    reasons.push(`You both like ${sharedInterests.slice(0, 3).join(', ')}`);
  }
  if (personalityMatches.length) {
    reasons.push(`Your personality quiz answers align on ${personalityMatches.length} points`);
  }
  if (distanceKm <= 5) {
    reasons.push('You are both nearby');
  }
  if (candidate.activityScore >= 40) {
    reasons.push('They are active and likely to reply');
  }

  return {
    compatibilityScore: Math.max(55, Math.min(99, Math.round(score))),
    reasons: reasons.length ? reasons : ['Your preferences line up well'],
    distanceKm
  };
}

function buildSmartSuggestion(currentUser, candidate, compatibility) {
  if (compatibility.reasons[0]) {
    return `You might like ${candidate.name} because ${compatibility.reasons[0].toLowerCase()}.`;
  }

  return `You might like ${candidate.name} because your profile preferences are close.`;
}

function buildSuggestedReplies(lastMessageText = '') {
  const prompt = String(lastMessageText).toLowerCase();
  if (prompt.includes('trip') || prompt.includes('travel')) {
    return ['I would pick Japan first', 'Road trips are my weakness', 'Beach trips always win for me'];
  }
  if (prompt.includes('coffee') || prompt.includes('tea')) {
    return ['Coffee, always', 'Tea if the weather is good', 'I switch depending on the mood'];
  }

  return [
    ...QUICK_REPLY_BANK.friendly.slice(0, 1),
    ...QUICK_REPLY_BANK.funny.slice(0, 1),
    ...QUICK_REPLY_BANK.flirty.slice(0, 1)
  ];
}

function pickProfileInterests(currentUser, count = 4) {
  const shared = shuffleList(
    normalizeInterestList(currentUser.interests || []).filter((interest) => ALLOWED_INTERESTS.includes(interest))
  );
  const filler = shuffleList(ALLOWED_INTERESTS.filter((interest) => !shared.includes(interest)));
  return [...shared.slice(0, 2), ...filler.slice(0, Math.max(0, count - Math.min(2, shared.length)))]
    .slice(0, count);
}

function buildSyntheticPersonalityAnswers(currentUser, index) {
  const defaults = {
    socialStyle: ['Introvert', 'Ambivert', 'Extrovert'],
    scheduleStyle: ['Night owl', 'Balanced', 'Early bird'],
    datingIntent: ['Serious', 'Casual', 'Open to both'],
    communicationStyle: ['Fast replies', 'Thoughtful replies', 'Voice note energy'],
    weekendStyle: ['Outdoors', 'Movies and food', 'Parties and social plans']
  };

  return Object.fromEntries(Object.entries(defaults).map(([key, options]) => {
    const preferred = currentUser.personalityAnswers?.[key];
    return [key, preferred || options[index % options.length]];
  }));
}

async function createSyntheticMatchCandidate(currentUser, index, forcedGender = null) {
  const targetGender = forcedGender || getPreferredMatchGender(currentUser) || 'Other';
  const entries = getGeneratedProfileEntries(targetGender);
  const entryCount = Math.max(1, entries.length);
  const entryIndex = index % entryCount;
  const variantNumber = Math.floor(index / entryCount) + 1;
  const entry = entries[entryIndex] || {};
  const email = variantNumber === 1
    ? `generated-match-${targetGender.toLowerCase()}-${entryIndex + 1}@campusmatch.local`
    : `generated-match-${targetGender.toLowerCase()}-${entryIndex + 1}-${variantNumber}@campusmatch.local`;
  const existingUser = await User.findOne({ email });
  const password = existingUser?.password || await bcrypt.hash(`Generated@${targetGender}${entryIndex + 1}${variantNumber}`, 10);

  const syntheticUser = existingUser || new User({ email, password });
  const preferredLocation = getEffectiveLocation(currentUser) || currentUser.location || entry.location || 'Campus';
  syntheticUser.name = entry.name || `Generated ${targetGender} ${entryIndex + 1}`;
  syntheticUser.age = Math.max(18, Number(entry.age || currentUser.age || 22));
  syntheticUser.gender = targetGender;
  syntheticUser.interestedIn = 'Everyone';
  syntheticUser.location = preferredLocation;
  syntheticUser.bio = entry.bio || 'A demo profile generated for your queue.';
  syntheticUser.interests = Array.isArray(entry.interests) && entry.interests.length ? entry.interests.slice(0, 4) : pickProfileInterests(currentUser, 4);
  syntheticUser.photos = buildGeneratedPhotoSet(
    targetGender,
    Array.isArray(entry.photos) && entry.photos.length ? entry.photos : (getGeneratedProfileEntries('Other')[0]?.photos || []),
    index
  );
  syntheticUser.education = entry.education || currentUser.education || 'College';
  syntheticUser.job = entry.job || currentUser.job || '';
  syntheticUser.role = 'user';
  syntheticUser.isVerified = true;
  syntheticUser.verificationStatus = 'verified';
  syntheticUser.profileVisible = true;
  syntheticUser.onboardingCompleted = true;
  syntheticUser.allowMessages = true;
  syntheticUser.personalityAnswers = {
    ...buildSyntheticPersonalityAnswers(currentUser, entryIndex),
    datingIntent: entry.datingIntent || currentUser.personalityAnswers?.datingIntent || 'Open to both'
  };
  syntheticUser.lifestyleAnswers = { ...currentUser.lifestyleAnswers };
  syntheticUser.profilePrompts = {
    communicationStyle: currentUser.profilePrompts?.communicationStyle?.slice(0, 1) || [],
    loveLanguage: currentUser.profilePrompts?.loveLanguage?.slice(0, 1) || [],
    educationLevel: currentUser.profilePrompts?.educationLevel || currentUser.education || '',
    standoutPromptQuestion: currentUser.profilePrompts?.standoutPromptQuestion || 'My ideal first date is...',
    standoutPromptAnswer: currentUser.profilePrompts?.standoutPromptAnswer || 'Coffee, easy conversation, and a walk after.'
  };
  syntheticUser.distancePreferenceKm = currentUser.distancePreferenceKm || 80;
  syntheticUser.latitude = typeof currentUser.latitude === 'number' ? currentUser.latitude : null;
  syntheticUser.longitude = typeof currentUser.longitude === 'number' ? currentUser.longitude : null;
  syntheticUser.points = 20 + entryIndex * 3;
  syntheticUser.streakCount = 2 + (entryIndex % 4);
  syntheticUser.activityScore = 50 + entryIndex * 5;
  syntheticUser.qualityScore = 90;
  syntheticUser.qualityVisible = true;
  syntheticUser.lastSeenAt = new Date(Date.now() - entryIndex * 60 * 60 * 1000);

  applyProfileQuality(syntheticUser);
  await syntheticUser.save();
  return syntheticUser;
}

async function ensureSeededMatchesForUser(currentUser, minimumCount = AUTO_MATCH_TARGET) {
  if (!minimumCount || minimumCount < 1) {
    return;
  }

  const existingMatches = await Match.find({
    $or: [{ user1Id: currentUser._id }, { user2Id: currentUser._id }]
  }).select('user1Id user2Id').lean();

  if (existingMatches.length >= minimumCount) {
    return;
  }

  const likeInteractions = await Like.find({
    $or: [{ fromUserId: currentUser._id }, { toUserId: currentUser._id }]
  }).select('fromUserId toUserId').lean();

  const excludedIds = new Set([
    currentUser._id.toString(),
    ...(currentUser.blockedUsers || []).map((id) => id.toString()),
    ...(currentUser.blockedBy || []).map((id) => id.toString()),
    ...existingMatches.flatMap((match) => [match.user1Id?.toString(), match.user2Id?.toString()]).filter(Boolean),
    ...likeInteractions.flatMap((item) => [item.fromUserId?.toString(), item.toUserId?.toString()]).filter(Boolean)
  ]);

  const compatibleCandidates = shuffleList(
    await User.find({
      _id: { $nin: Array.from(excludedIds) },
      role: 'user',
      profileVisible: true,
      qualityVisible: true,
      onboardingCompleted: true,
      adminBlocked: false,
      isVerified: true
    })
      .select('_id gender interestedIn interests personalityAnswers activityScore boostedUntil latitude longitude location')
      .lean()
  )
    .filter((candidate) => matchesPreference(currentUser, candidate))
    .sort((a, b) => calculateCompatibility(currentUser, b).compatibilityScore - calculateCompatibility(currentUser, a).compatibilityScore);

  const neededCount = minimumCount - existingMatches.length;
  const selectedCandidates = compatibleCandidates.slice(0, neededCount);
  const syntheticCandidates = [];

  for (let index = selectedCandidates.length; index < neededCount; index += 1) {
    const syntheticCandidate = await createSyntheticMatchCandidate(currentUser, index);
    syntheticCandidates.push(syntheticCandidate);
  }

  for (const candidate of [...selectedCandidates, ...syntheticCandidates]) {
    const pair = orderPair(currentUser._id, candidate._id);
    await Match.findOneAndUpdate(pair, pair, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
}

async function ensureDiscoverCandidatesForUser(currentUser, minimumCount = DISCOVER_PAGE_SIZE, targetGender = null) {
  if (!minimumCount || minimumCount < 1) {
    return;
  }

  const resolvedTargetGender = targetGender && targetGender !== 'Everyone'
    ? targetGender
    : getPreferredMatchGender(currentUser) || 'Other';
  const interactions = await Like.find({ fromUserId: currentUser._id, status: 'liked' }).select('toUserId').lean();
  const excludedIds = [
    currentUser._id,
    ...(currentUser.blockedUsers || []),
    ...(currentUser.blockedBy || []),
    ...interactions.map((item) => item.toUserId)
  ];

  const discoverableCandidates = await User.find({
    _id: { $nin: excludedIds },
    role: 'user',
    profileVisible: true,
    qualityVisible: true,
    onboardingCompleted: true,
    adminBlocked: false,
    isVerified: true
  })
    .select('_id gender interestedIn')
    .lean();

  const compatibleCount = discoverableCandidates.filter((candidate) => {
    if (targetGender && targetGender !== 'Everyone') {
      return candidate.gender === targetGender;
    }
    return matchesPreference(currentUser, candidate);
  }).length;
  if (compatibleCount >= minimumCount) {
    return;
  }

  const neededCount = minimumCount - compatibleCount;
  const generatedEmailPrefix = `generated-match-${resolvedTargetGender.toLowerCase()}-`;
  const existingGeneratedCount = await User.countDocuments({
    email: { $regex: `^${generatedEmailPrefix}` }
  });

  for (let index = 0; index < neededCount; index += 1) {
    await createSyntheticMatchCandidate(currentUser, existingGeneratedCount + index, resolvedTargetGender);
  }
}

function detectModerationIssue(text) {
  const content = String(text || '').trim();
  if (!content) {
    return 'empty';
  }

  if (content.length > 500) {
    return 'spam';
  }

  for (const pattern of MODERATION_PATTERNS) {
    if (pattern.test(content)) {
      return 'unsafe';
    }
  }

  return null;
}

async function registerActivity(user, action) {
  if (action === 'profile_complete') {
    user.points += 20;
  }
  if (action === 'like') {
    user.points += 1;
  }
  if (action === 'first_message') {
    user.points += 10;
  }
  if (action === 'boost') {
    user.points += 2;
  }
  user.activityScore = Math.min(100, user.streakCount * 6 + user.points / 4);
  await user.save();
}

async function createMatchIfMutual(fromUserId, toUserId) {
  const oppositeLike = await Like.findOne({
    fromUserId: toUserId,
    toUserId: fromUserId,
    status: 'liked'
  }).lean();

  if (!oppositeLike) {
    return null;
  }

  const pair = orderPair(fromUserId, toUserId);
  let match = await Match.findOne(pair);
  if (!match) {
    match = await Match.create(pair);
  }

  const io = getSocketIo();
  if (io) {
    io.to(`user:${fromUserId.toString()}`).emit('match:new', { matchId: match._id, userId: toUserId.toString() });
    io.to(`user:${toUserId.toString()}`).emit('match:new', { matchId: match._id, userId: fromUserId.toString() });
  }

  return match;
}

function isMatchStarredForUser(match, userId) {
  return (match.starredBy || []).some((id) => id.toString() === userId.toString());
}

async function ensureMatchAccess(matchId, userId) {
  const match = await Match.findById(matchId);
  if (!match) {
    return null;
  }

  const isMember = [match.user1Id.toString(), match.user2Id.toString()].includes(userId.toString());
  return isMember ? match : null;
}

async function seedDefaultAdmin() {
  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    return;
  }

  const password = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123', 10);
  const admin = new User({
    name: 'Admin',
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@datingapp.local',
    password,
    age: 25,
    gender: 'Other',
    interestedIn: 'Everyone',
    location: 'Campus',
    bio: 'System administrator',
    interests: ['management', 'moderation'],
    photos: ['https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80'],
    role: 'admin',
    isVerified: true,
    verificationStatus: 'verified',
    verificationFaceMatchScore: 96,
    qualityVisible: true,
    qualityScore: 95
  });
  await admin.save();
}

module.exports = {
  ALLOWED_INTERESTS,
  AUTO_MATCH_TARGET,
  BOOST_DURATION_MS,
  DAILY_LIKE_LIMIT,
  DISCOVER_PAGE_SIZE,
  ICEBREAKER_PROMPTS,
  PREMIUM_LIKE_LIMIT,
  applyProfileQuality,
  assignGeneratedPhotos,
  buildGeneratedProfilesForGenders,
  buildIdentityQuery,
  buildSmartSuggestion,
  buildSuggestedReplies,
  calculateAgeFromBirthDate,
  calculateCompatibility,
  createMatchIfMutual,
  createOtp,
  dedupeLikeItems,
  dedupeProfileCards,
  dedupeUsers,
  detectModerationIssue,
  ensureDiscoverCandidatesForUser,
  ensureMatchAccess,
  ensureSeededMatchesForUser,
  evaluateProfileQuality,
  getOppositeGender,
  getSocketIo,
  isMatchStarredForUser,
  isOnboardingComplete,
  matchesPreference,
  normalizeInterestList,
  normalizePhotoList,
  orderPair,
  registerActivity,
  resolveTargetUser,
  sameDay,
  sanitizeUser,
  seedDefaultAdmin,
  sendResetPasswordEmail,
  setSocketIo,
  shuffleList,
  updateStreak
};
