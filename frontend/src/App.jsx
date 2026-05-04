import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import Navbar from './components/Navbar';
import ProfileCard from './components/ProfileCard';
import MatchCard from './components/MatchCard';
import MessageList from './components/MessageList';
import HomeView from './pages/Home';
import LoginView from './pages/Login';
import RegisterView from './pages/Register';
import MatchesShell from './pages/Matches';
import MessagesShell from './pages/Messages';
import { apiFetch, connectToProfile, getSocketUrl, updateMatchStar } from './services/api';

const tokenKey = 'dating-app-token';
const userKey = 'dating-app-user';
const MAX_INTERESTS = 6;
const INTEREST_CATEGORIES = [
  {
    name: 'Entertainment',
    icon: '🎬',
    items: ['Music', 'Movies', 'Web Series', 'Anime']
  },
  {
    name: 'Lifestyle',
    icon: '🧘',
    items: ['Fitness', 'Yoga', 'Gym', 'Meditation']
  },
  {
    name: 'Social / Outdoor',
    icon: '🏕️',
    items: ['Traveling', 'Hiking', 'Adventure', 'Photography']
  },
  {
    name: 'Intellectual / Skills',
    icon: '💡',
    items: ['Coding', 'Reading', 'Writing', 'Startups']
  },
  {
    name: 'Food & Fun',
    icon: '☕',
    items: ['Cooking', 'Foodie', 'Coffee', 'Street Food']
  },
  {
    name: 'Hobbies',
    icon: '🎨',
    items: ['Gaming', 'Drawing', 'Dancing', 'Singing']
  }
];

const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const MATCH_GENDER_FILTER_OPTIONS = ['Male', 'Female', 'Other'];
const INTEREST_PREFERENCE_OPTIONS = ['Male', 'Female', 'Other', 'Everyone'];
const DATING_INTENT_OPTIONS = [
  { value: 'Serious', emoji: '💘', label: 'Long-term partner' },
  { value: 'Open to both', emoji: '😍', label: 'Long-term, open to short' },
  { value: 'Casual', emoji: '✨', label: 'Short-term fun' }
];
const LIFESTYLE_SECTIONS = [
  {
    key: 'drinking',
    title: 'How often do you drink?',
    options: ['Not for me', 'Sober', 'On special occasions', 'Socially on weekends', 'Most nights']
  },
  {
    key: 'smoking',
    title: 'How often do you smoke?',
    options: ['Non-smoker', 'Social smoker', 'Smoker when drinking', 'Smoker', 'Trying to quit']
  },
  {
    key: 'workout',
    title: 'Do you workout?',
    options: ['Everyday', 'Often', 'Sometimes', 'Never']
  },
  {
    key: 'pets',
    title: 'Do you have any pets?',
    options: ['Dog parent', 'Cat parent', 'Other pets', 'Want one someday', 'No pets']
  }
];
const PROFILE_PROMPT_SECTIONS = [
  {
    key: 'communicationStyle',
    title: 'What is your communication style?',
    max: 2,
    options: ['I stay on WhatsApp all day', 'Big time texter', 'Phone caller', 'Video chatter', "I'm slow to answer on WhatsApp", 'Bad texter', 'Better in person']
  },
  {
    key: 'loveLanguage',
    title: 'How do you receive love?',
    max: 2,
    options: ['Thoughtful gestures', 'Presents', 'Touch', 'Compliments', 'Time together']
  }
];
const EDUCATION_LEVEL_OPTIONS = ['Bachelors', 'In College', 'High School', 'Masters', 'PhD'];
const PHOTO_SLOT_COUNT = 6;
const STANDOUT_PROMPT_OPTIONS = [
  'A perfect first date is...',
  'The quickest way to my heart is...',
  'I will fall for you if...',
  'My simple pleasures are...',
  'A fact about me that surprises people...'
];

function normalizeInterestSelection(interests = [], limit = MAX_INTERESTS) {
  const allowed = new Set(INTEREST_CATEGORIES.flatMap((category) => category.items));
  const values = Array.isArray(interests) ? interests : [];
  return [...new Set(values.filter((item) => allowed.has(item)))].slice(0, limit);
}

function needsOnboarding(user) {
  return Boolean(user && user.role !== 'admin' && !user.onboardingCompleted);
}

function calculateAgeFromBirthDate(birthDate) {
  if (!birthDate) {
    return 0;
  }

  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDelta = today.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

function padPhotoSlots(photos = []) {
  const next = Array.from({ length: PHOTO_SLOT_COUNT }, (_, index) => photos[index] || '');
  return next;
}

function normalizePhotoList(photos = []) {
  return [...new Set(
    photos
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function createOnboardingForm(user) {
  return {
    name: user?.name || '',
    birthDate: user?.birthDate ? new Date(user.birthDate).toISOString().split('T')[0] : '',
    age: user?.age || 18,
    gender: user?.gender || 'Other',
    showGenderOnProfile: Boolean(user?.showGenderOnProfile),
    interestedIn: user?.interestedIn || 'Everyone',
    location: user?.location || '',
    bio: user?.bio || '',
    interests: normalizeInterestSelection(user?.interests || [], 10),
    photos: padPhotoSlots(user?.photos || []),
    education: user?.education || '',
    job: user?.job || '',
    distancePreferenceKm: Number(user?.distancePreferenceKm || 80),
    personalityAnswers: {
      socialStyle: user?.personalityAnswers?.socialStyle || 'Ambivert',
      scheduleStyle: user?.personalityAnswers?.scheduleStyle || 'Balanced',
      datingIntent: user?.personalityAnswers?.datingIntent || '',
      communicationStyle: user?.personalityAnswers?.communicationStyle || '',
      weekendStyle: user?.personalityAnswers?.weekendStyle || 'Movies and food'
    },
    lifestyleAnswers: {
      drinking: user?.lifestyleAnswers?.drinking || '',
      smoking: user?.lifestyleAnswers?.smoking || '',
      workout: user?.lifestyleAnswers?.workout || '',
      pets: user?.lifestyleAnswers?.pets || ''
    },
    profilePrompts: {
      communicationStyle: user?.profilePrompts?.communicationStyle || [],
      loveLanguage: user?.profilePrompts?.loveLanguage || [],
      educationLevel: user?.profilePrompts?.educationLevel || '',
      standoutPromptQuestion: user?.profilePrompts?.standoutPromptQuestion || '',
      standoutPromptAnswer: user?.profilePrompts?.standoutPromptAnswer || ''
    },
    blockedContactIdentifiers: user?.blockedContactIdentifiers || []
  };
}

function buildOnboardingPayload(form, onboardingCompleted = false) {
  const cleanPhotos = normalizePhotoList(form.photos);
  const computedAge = calculateAgeFromBirthDate(form.birthDate);

  return {
    name: form.name.trim(),
    birthDate: form.birthDate || null,
    age: computedAge || form.age,
    gender: form.gender,
    showGenderOnProfile: form.showGenderOnProfile,
    interestedIn: form.interestedIn,
    location: form.location.trim(),
    bio: form.bio.trim(),
    interests: normalizeInterestSelection(form.interests, 10),
    photos: cleanPhotos,
    education: form.education.trim(),
    job: form.job.trim(),
    distancePreferenceKm: Number(form.distancePreferenceKm || 80),
    personalityAnswers: {
      ...form.personalityAnswers,
      datingIntent: form.personalityAnswers.datingIntent,
      communicationStyle: form.profilePrompts.communicationStyle[0] || form.personalityAnswers.communicationStyle || 'Thoughtful replies'
    },
    lifestyleAnswers: form.lifestyleAnswers,
    profilePrompts: form.profilePrompts,
    blockedContactIdentifiers: form.blockedContactIdentifiers.map((item) => item.trim()).filter(Boolean),
    onboardingCompleted
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Could not read that image. Please try another file.'));
    reader.readAsDataURL(file);
  });
}

function normalizeId(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value._id) {
    return String(value._id);
  }

  return String(value);
}

function normalizeProfileName(name) {
  return String(name || '')
    .replace(/\s+(Campus|City Center|Downtown|Nearby|Guntur|Vijayawada|Kurnool|Tirupati|Amaravati|Anantapur|Kakinada|Ongole)$/i, '')
    .trim()
    .toLowerCase();
}

function getProfileRenderKey(profile) {
  if (!profile) {
    return '';
  }

  const email = String(profile.email || '').trim().toLowerCase();
  const generatedEmailMatch = email.match(/^generated-match-([a-z]+)-(\d+)/);
  if (generatedEmailMatch) {
    return `generated-seed:${generatedEmailMatch[1]}:${generatedEmailMatch[2]}`;
  }

  const profileId = normalizeId(profile._id);
  const generatedProfileMatch = profileId.match(/^generated-user-([a-z]+)-(\d+)$/i);
  if (generatedProfileMatch) {
    return `generated-seed:${generatedProfileMatch[1].toLowerCase()}:${generatedProfileMatch[2]}`;
  }

  if (profileId) {
    return `id:${profileId}`;
  }

  const photo = String(profile.photos?.[0] || '').trim();
  if (photo) {
    return `photo:${photo}`;
  }

  const normalizedName = normalizeProfileName(profile.name);
  if (normalizedName) {
    return `name:${String(profile.gender || 'unknown').toLowerCase()}:${normalizedName}`;
  }

  return '';
}

function getProfileLookupKeys(profile) {
  if (!profile) {
    return [];
  }

  const keys = new Set();
  const renderKey = getProfileRenderKey(profile);
  const profileId = normalizeId(profile._id);
  const photo = String(profile.photos?.[0] || '').trim();
  const normalizedName = normalizeProfileName(profile.name);

  if (renderKey) {
    keys.add(renderKey);
  }
  if (profileId) {
    keys.add(`id:${profileId}`);
  }
  if (photo) {
    keys.add(`photo:${photo}`);
  }
  if (normalizedName) {
    keys.add(`name:${String(profile.gender || 'unknown').toLowerCase()}:${normalizedName}`);
  }

  return [...keys];
}

function dedupeCards(items, getProfile) {
  const seenProfiles = new Set();
  const seenPhotos = new Set();

  return (Array.isArray(items) ? items : []).filter((item) => {
    const profile = getProfile(item);
    const profileKey = getProfileRenderKey(profile);
    const photo = String(profile?.photos?.[0] || '').trim();

    if (profileKey && seenProfiles.has(profileKey)) {
      return false;
    }

    if (photo && seenPhotos.has(photo)) {
      return false;
    }

    if (profileKey) {
      seenProfiles.add(profileKey);
    }

    if (photo) {
      seenPhotos.add(photo);
    }

    return true;
  });
}

function getProfileHobbies(profile) {
  if (!profile) {
    return [];
  }

  const bio = String(profile.bio || '');
  const hobbiesMatch = bio.match(/Hobbies:\s*(.*?)(?:\.\s*Interests:|$)/i);

  if (hobbiesMatch?.[1]) {
    return hobbiesMatch[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  return (Array.isArray(profile.interests) ? profile.interests : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function formatRelativeTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) {
    return 'now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  return date.toLocaleDateString();
}

function buildChatPreview(match, currentUserId) {
  const preview = match?.lastMessage;
  if (!preview) {
    return 'Say hi and start the conversation';
  }

  const senderId = normalizeId(preview.senderId);
  const isOwnMessage = senderId === normalizeId(currentUserId);
  const prefix = isOwnMessage ? 'You: ' : '';

  if (preview.deletedForEveryone) {
    return `${prefix}Message deleted`;
  }
  if (preview.messageType === 'gif') {
    return `${prefix}Sent a GIF`;
  }
  if (preview.messageType === 'sticker') {
    return `${prefix}Sent a sticker`;
  }
  if (preview.messageType === 'game_prompt') {
    return `${prefix}${preview.messageText || 'Sent a prompt'}`;
  }

  return `${prefix}${preview.messageText || 'Started chatting'}`;
}

function getSwipeCardStyle(index, dragX = 0) {
  if (index === 0) {
    const rotation = dragX / 20;
    return {
      transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
      opacity: Math.max(0.45, 1 - Math.abs(dragX) / 320),
      zIndex: 30
    };
  }

  if (index === 1) {
    return {
      transform: 'scale(0.965) translateY(16px)',
      opacity: 0.88,
      zIndex: 20
    };
  }

  return {
    transform: 'scale(0.93) translateY(30px)',
    opacity: 0.72,
    zIndex: 10
  };
}

function useStoredSession() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);

  const saveSession = (nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
  };

  const updateUser = (nextUser) => {
    setUser(nextUser);
  };

  const clearSession = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
  };

  return { token, user, saveSession, updateUser, clearSession };
}

function ProtectedRoute({ user, children }) {
  return user ? children : <Navigate to="/auth" replace />;
}

function AdminRoute({ user, children }) {
  return user?.role === 'admin' ? children : <Navigate to="/" replace />;
}

function InterestsSelection({ selectedInterests, onChange, maxSelection = MAX_INTERESTS }) {
  const [search, setSearch] = useState('');
  const normalizedSelected = normalizeInterestSelection(selectedInterests, maxSelection);
  const query = search.trim().toLowerCase();

  const filteredCategories = INTEREST_CATEGORIES
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => item.toLowerCase().includes(query))
    }))
    .filter((category) => category.items.length > 0);

  function toggleInterest(interest) {
    const exists = normalizedSelected.includes(interest);
    if (exists) {
      onChange(normalizedSelected.filter((item) => item !== interest));
      return;
    }

    if (normalizedSelected.length >= maxSelection) {
      return;
    }

    onChange([...normalizedSelected, interest]);
  }

  return (
    <section className="interestsSelector">
      <div className="interestsHeader">
        <div>
          <h3>Select your interests</h3>
          <p className="subtle">Choose up to {maxSelection} interests for better matches.</p>
        </div>
        <span className="pill">{normalizedSelected.length}/{maxSelection} selected</span>
      </div>

      <input
        className="interestSearch"
        placeholder="Search interests"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="selectedInterestBox">
        <strong>Selected Interests</strong>
        <div className="chipGrid">
          {normalizedSelected.length ? normalizedSelected.map((interest) => (
            <button
              key={interest}
              type="button"
              className="interestChip selected"
              onClick={() => toggleInterest(interest)}
            >
              {interest}
            </button>
          )) : <span className="subtle">No interests selected yet.</span>}
        </div>
      </div>

      <div className="interestCategoryList">
        {filteredCategories.map((category) => (
          <section key={category.name} className="interestCategory">
            <div className="interestCategoryTitle">{category.icon} {category.name}</div>
            <div className="chipGrid">
              {category.items.map((interest) => {
                const selected = normalizedSelected.includes(interest);
                const disabled = !selected && normalizedSelected.length >= maxSelection;

                return (
                  <button
                    key={interest}
                    type="button"
                    className={`interestChip${selected ? ' selected' : ''}`}
                    disabled={disabled}
                    onClick={() => toggleInterest(interest)}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {!filteredCategories.length && <p className="notice">No interests found for that search.</p>}
      </div>
    </section>
  );
}

function Layout({ user, notifications, onLogout, children }) {
  const location = useLocation();
  const isOnboardingPage = location.pathname === '/setup-profile';

  return (
    <div className={`shell${isOnboardingPage ? ' shellOnboarding' : ''}`}>
      <style>{styles}</style>
      {!isOnboardingPage && (
        <>
          <Navbar user={user} onLogout={onLogout} />

          {user && (
            <section className="heroCard">
              <div>
                <h2 className="profileHeading">
                  <span className="profileIcon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" role="img" focusable="false">
                      <path d="M12 12a4.25 4.25 0 1 0-4.25-4.25A4.25 4.25 0 0 0 12 12Zm0 2.25c-4.18 0-7.5 2.16-7.5 4.75V20h15v-1c0-2.59-3.32-4.75-7.5-4.75Z" />
                    </svg>
                  </span>
                  {user.name || 'New member'} • {user.isVerified ? 'Verified' : 'Unverified'}
                </h2>
                <p>{user.location || 'Complete your profile'} • {user.premium?.isPremium ? 'Premium active' : 'Free tier'} • Streak {notifications.streakCount || 0} days</p>
              </div>
              <div className="pillRow">
                <span className="pill">Likes {notifications.newLikes}</span>
                <span className="pill">Matches {notifications.newMatches}</span>
                <span className="pill">Unread {notifications.unreadMessages}</span>
                <span className="pill">Points {notifications.points || 0}</span>
              </div>
            </section>
          )}
        </>
      )}

      <main>{children}</main>
    </div>
  );
}

function HomePage({ user }) {
  return <HomeView user={user} />;
}

function AuthPage({ onSession }) {
  const [mode, setMode] = useState('login');
  const [message, setMessage] = useState('');
  const [otpIdentity, setOtpIdentity] = useState({ email: '', phone: '' });
  const [otpCode, setOtpCode] = useState('');
  const [resetOtpCode, setResetOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState({
    email: '',
    phone: '',
    password: ''
  });

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');

    try {
      if (mode === 'signup') {
        const data = await apiFetch('/api/auth/signup', {
          method: 'POST',
          body: {
            email: form.email,
            phone: form.phone,
            password: form.password
          }
        });
        setOtpIdentity({ email: form.email, phone: form.phone });
        setMode('verify');
        setMessage(`${data.message} Demo OTP: ${data.otpCode}`);
      } else if (mode === 'login') {
        const data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: { email: form.email, phone: form.phone, password: form.password }
        });
        onSession(data.token, data.user);
      } else if (mode === 'verify') {
        const data = await apiFetch('/api/auth/verify-otp', {
          method: 'POST',
          body: { ...otpIdentity, otpCode }
        });
        onSession(data.token, data.user);
      } else if (mode === 'forgot') {
        const data = await apiFetch('/api/auth/forgot-password', {
          method: 'POST',
          body: { email: form.email, phone: form.phone }
        });
        setMode('reset');
        setMessage(data.resetOtpCode ? `${data.message} Demo reset OTP: ${data.resetOtpCode}` : data.message);
      } else if (mode === 'reset') {
        const data = await apiFetch('/api/auth/reset-password', {
          method: 'POST',
          body: { email: form.email, phone: form.phone, otpCode: resetOtpCode, newPassword }
        });
        setMode('login');
        setMessage(data.message);
      }
    } catch (error) {
      if (mode === 'login' && error.status === 403 && error.data?.otpCode) {
        setOtpIdentity({ email: form.email, phone: form.phone });
        setMode('verify');
        setMessage(`${error.message} Demo OTP: ${error.data.otpCode}`);
        return;
      }

      setMessage(error.message);
    }
  }

  return (
    <section className="grid twoCol">
      <article className="card authCard">
        {mode === 'signup' && (
          <RegisterView form={form} setForm={setForm} onSubmit={handleSubmit} message={message} />
        )}
        {mode === 'login' && (
          <LoginView form={form} setForm={setForm} onSubmit={handleSubmit} message={message} />
        )}
        {mode === 'verify' && (
          <>
            <h2>Verify OTP</h2>
            <p className="subtle">Enter the OTP code to unlock the onboarding flow.</p>
            <form className="form" onSubmit={handleSubmit}>
              <input placeholder="OTP code" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} required />
              <button>Submit</button>
            </form>
            {message && <p className="notice">{message}</p>}
          </>
        )}
        {mode === 'forgot' && (
          <>
            <h2>Forgot password</h2>
            <p className="subtle">Enter your email or phone to generate a reset OTP.</p>
            <form className="form" onSubmit={handleSubmit}>
              <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <button>Submit</button>
            </form>
            {message && <p className="notice">{message}</p>}
          </>
        )}
        {mode === 'reset' && (
          <>
            <h2>Reset password</h2>
            <p className="subtle">Use the reset OTP and choose a new password.</p>
            <form className="form" onSubmit={handleSubmit}>
              <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input placeholder="Reset OTP" value={resetOtpCode} onChange={(e) => setResetOtpCode(e.target.value)} required />
              <input placeholder="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <button>Submit</button>
            </form>
            {message && <p className="notice">{message}</p>}
          </>
        )}
        <div className="actionsRow">
          <button type="button" className="ghost" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Switch to login' : 'Switch to signup'}</button>
          {mode !== 'signup' && mode !== 'verify' && <button type="button" className="ghost" onClick={() => setMode('forgot')}>Forgot password</button>}
        </div>
      </article>

      <article className="card">
        <h3>New flow after signup</h3>
        <ul className="list">
          <li>OTP verification first for a clean auth flow.</li>
          <li>Full-page onboarding after login or verification.</li>
          <li>Profile details collected step by step instead of one long form.</li>
          <li>Discovery stays locked until at least 3 interests, a bio, and 2 photos are added.</li>
        </ul>
      </article>
    </section>
  );
}

function ProfileSetupPage({ token, user, refreshUser }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [contactDraft, setContactDraft] = useState('');
  const [form, setForm] = useState(() => createOnboardingForm(user));
  const photoInputRef = useRef(null);

  useEffect(() => {
    setForm(createOnboardingForm(user));
  }, [user]);

  useEffect(() => {
    setContactDraft((form.blockedContactIdentifiers || []).join('\n'));
  }, [form.blockedContactIdentifiers]);

  const steps = [
    { key: 'rules', title: 'Welcome to BBC.', subtitle: 'Please follow these house rules.' },
    { key: 'name', title: "What's your first name?", subtitle: "This is how it'll appear on your profile. Can't change it later." },
    { key: 'birthday', title: 'Your b-day?', subtitle: 'Your profile shows your age, not your birth date.' },
    { key: 'gender', title: "What's your gender?", subtitle: 'Select what describes you best so we can personalize discovery.' },
    { key: 'interested', title: 'Who are you interested in seeing?', subtitle: 'This helps us recommend the right people for you.' },
    { key: 'distance', title: 'Your distance preference?', subtitle: 'Use the slider to set the maximum distance for potential matches.' },
    { key: 'intent', title: 'What are you looking for?', subtitle: "All good if it changes. There's something for everyone." },
    { key: 'lifestyle', title: `Let's talk lifestyle habits${form.name ? `, ${form.name}` : ''}`, subtitle: 'Do their habits match yours? You go first.' },
    { key: 'about', title: 'What else makes you you?', subtitle: 'Add your city, a bio, and a few profile details people can connect with.' },
    { key: 'interests', title: 'What are you into?', subtitle: 'Choose at least 3 interests to find people who like similar things.' },
    { key: 'photos', title: 'Add your recent pics', subtitle: "Let's add 2 to start. Upload from your device or paste an image URL." },
    { key: 'shareMore', title: 'Share more about yourself', subtitle: 'Write a bio and a prompt to help your profile stand out and spark conversations.' },
    { key: 'avoidContacts', title: 'Want to avoid someone you know on BBC?', subtitle: 'Add contact numbers or emails you want to avoid so you do not see each other in discovery.' }
  ];

  function isCurrentStepValid() {
    switch (steps[step].key) {
      case 'name':
        return form.name.trim().length >= 2;
      case 'birthday':
        return Boolean(form.birthDate) && calculateAgeFromBirthDate(form.birthDate) >= 18;
      case 'gender':
        return Boolean(form.gender);
      case 'interested':
        return Boolean(form.interestedIn);
      case 'distance':
        return Number(form.distancePreferenceKm) >= 5;
      case 'intent':
        return Boolean(form.personalityAnswers.datingIntent);
      case 'about':
        return form.location.trim().length >= 2 && form.bio.trim().length >= 20;
      case 'interests':
        return form.interests.length >= 3;
      case 'photos':
        return form.photos.filter((item) => item.trim()).length >= 2;
      case 'shareMore':
        return form.bio.trim().length >= 20 || Boolean(form.profilePrompts.standoutPromptAnswer.trim());
      default:
        return true;
    }
  }

  async function saveStep({ complete = false, nextStep = step + 1 } = {}) {
    setIsSaving(true);
    setMessage('');

    try {
      const data = await apiFetch('/api/users/profile', {
        method: 'PUT',
        token,
        body: buildOnboardingPayload(form, complete)
      });
      refreshUser(data.user);
      if (complete) {
        navigate('/matches', { replace: true });
        return;
      }
      setMessage(`Saved. Profile quality score: ${data.quality?.qualityScore || 0}`);
      setStep(nextStep);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function togglePromptSelection(sectionKey, option, max) {
    const currentItems = form.profilePrompts[sectionKey];
    const exists = currentItems.includes(option);
    const nextItems = exists
      ? currentItems.filter((item) => item !== option)
      : currentItems.length >= max
        ? [...currentItems.slice(1), option]
        : [...currentItems, option];

    setForm({
      ...form,
      profilePrompts: {
        ...form.profilePrompts,
        [sectionKey]: nextItems
      }
    });
  }

  function updatePhotoAtIndex(index, value) {
    const nextPhotos = [...form.photos];
    nextPhotos[index] = value;
    setForm({ ...form, photos: nextPhotos });
  }

  async function handlePhotoFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setMessage('Please choose an image file.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      updatePhotoAtIndex(activePhotoIndex, dataUrl);
      setMessage(`Photo ${activePhotoIndex + 1} added from your device.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      event.target.value = '';
    }
  }

  function handlePhotoUrlChange(value) {
    updatePhotoAtIndex(activePhotoIndex, value);
  }

  function removeActivePhoto() {
    updatePhotoAtIndex(activePhotoIndex, '');
    setMessage(`Photo ${activePhotoIndex + 1} removed.`);
  }

  function renderStepContent() {
    switch (steps[step].key) {
      case 'rules':
        return (
          <div className="onboardingRules">
            <div className="logoDot" />
            <div className="ruleBlock">
              <strong>Be yourself.</strong>
              <p>Make sure your photos, age, and bio are true to who you are.</p>
            </div>
            <div className="ruleBlock">
              <strong>Stay safe.</strong>
              <p>Don&apos;t be too quick to give out personal information. Date safely.</p>
            </div>
            <div className="ruleBlock">
              <strong>Play it cool.</strong>
              <p>Respect others and treat them as you would like to be treated.</p>
            </div>
            <div className="ruleBlock">
              <strong>Be proactive.</strong>
              <p>Always report bad behavior.</p>
            </div>
          </div>
        );
      case 'name':
        return (
          <div className="onboardingFormSection">
            <input
              className="onboardingInput"
              placeholder="First name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
        );
      case 'birthday':
        return (
          <div className="onboardingFormSection">
            <input
              className="onboardingInput"
              type="date"
              value={form.birthDate}
              onChange={(event) => setForm({ ...form, birthDate: event.target.value, age: calculateAgeFromBirthDate(event.target.value) })}
            />
          </div>
        );
      case 'gender':
        return (
          <div className="onboardingFormSection">
            <div className="optionStack">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`selectCard${form.gender === option ? ' selected' : ''}`}
                  onClick={() => setForm({ ...form, gender: option })}
                >
                  {option === 'Other' ? 'Beyond Binary' : option}
                </button>
              ))}
            </div>
            <label className="toggle onboardingToggle">
              <input
                type="checkbox"
                checked={form.showGenderOnProfile}
                onChange={(event) => setForm({ ...form, showGenderOnProfile: event.target.checked })}
              />
              Show gender on profile
            </label>
          </div>
        );
      case 'interested':
        return (
          <div className="onboardingFormSection">
            <div className="optionStack">
              {INTEREST_PREFERENCE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`selectCard${form.interestedIn === option ? ' selected' : ''}`}
                  onClick={() => setForm({ ...form, interestedIn: option })}
                >
                  {option === 'Male' ? 'Men' : option === 'Female' ? 'Women' : option === 'Other' ? 'Beyond Binary' : 'Everyone'}
                </button>
              ))}
            </div>
          </div>
        );
      case 'distance':
        return (
          <div className="onboardingFormSection">
            <div className="distanceHeader">
              <span>Distance Preference</span>
              <strong>{form.distancePreferenceKm} km</strong>
            </div>
            <input
              className="distanceSlider"
              type="range"
              min="5"
              max="200"
              step="5"
              value={form.distancePreferenceKm}
              onChange={(event) => setForm({ ...form, distancePreferenceKm: Number(event.target.value) })}
            />
            <p className="subtle">You can change preferences later in Settings.</p>
          </div>
        );
      case 'intent':
        return (
          <div className="onboardingFormSection optionGrid">
            {DATING_INTENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`goalCard${form.personalityAnswers.datingIntent === option.value ? ' selected' : ''}`}
                onClick={() => setForm({
                  ...form,
                  personalityAnswers: {
                    ...form.personalityAnswers,
                    datingIntent: option.value
                  }
                })}
              >
                <span className="goalEmoji">{option.emoji}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        );
      case 'lifestyle':
        return (
          <div className="onboardingFormSection stackedSections">
            {LIFESTYLE_SECTIONS.map((section) => (
              <section key={section.key} className="tagSection">
                <h3>{section.title}</h3>
                <div className="tagGrid">
                  {section.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`tagButton${form.lifestyleAnswers[section.key] === option ? ' selected' : ''}`}
                      onClick={() => setForm({
                        ...form,
                        lifestyleAnswers: {
                          ...form.lifestyleAnswers,
                          [section.key]: option
                        }
                      })}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      case 'about':
        return (
          <div className="onboardingFormSection stackedSections">
            <input
              className="onboardingInput"
              placeholder="City"
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
            />
            <textarea
              className="onboardingInput onboardingTextarea"
              placeholder="Write a short bio about yourself"
              value={form.bio}
              onChange={(event) => setForm({ ...form, bio: event.target.value })}
            />
            {PROFILE_PROMPT_SECTIONS.map((section) => (
              <section key={section.key} className="tagSection">
                <h3>{section.title}</h3>
                <div className="tagGrid">
                  {section.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`tagButton${form.profilePrompts[section.key].includes(option) ? ' selected' : ''}`}
                      onClick={() => togglePromptSelection(section.key, option, section.max)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <section className="tagSection">
              <h3>What is your education level?</h3>
              <div className="tagGrid">
                {EDUCATION_LEVEL_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`tagButton${form.profilePrompts.educationLevel === option ? ' selected' : ''}`}
                    onClick={() => setForm({
                      ...form,
                      education: option,
                      profilePrompts: {
                        ...form.profilePrompts,
                        educationLevel: option
                      }
                    })}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </section>
          </div>
        );
      case 'interests':
        return (
          <InterestsSelection
            selectedInterests={form.interests}
            onChange={(nextInterests) => setForm({ ...form, interests: nextInterests })}
            maxSelection={10}
          />
        );
      case 'photos':
        return (
          <div className="onboardingFormSection">
            <div className="photoSlots">
              {form.photos.map((photo, index) => (
                <button
                  key={`slot-${index + 1}`}
                  type="button"
                  className={`photoSlot${activePhotoIndex === index ? ' active' : ''}${photo ? ' filled' : ''}`}
                  onClick={() => setActivePhotoIndex(index)}
                >
                  {photo ? <img src={photo} alt={`Profile slot ${index + 1}`} /> : <span>+</span>}
                </button>
              ))}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hiddenFileInput"
              onChange={handlePhotoFileChange}
            />
            <div className="photoActionRow">
              <button
                type="button"
                className="primaryCta photoPickerButton"
                onClick={() => photoInputRef.current?.click()}
              >
                Upload from device
              </button>
              <button
                type="button"
                className="ghost"
                onClick={removeActivePhoto}
                disabled={!form.photos[activePhotoIndex]}
              >
                Remove selected photo
              </button>
            </div>
            <input
              className="onboardingInput"
              placeholder={`Paste image URL for photo ${activePhotoIndex + 1} instead`}
              value={form.photos[activePhotoIndex]}
              onChange={(event) => handlePhotoUrlChange(event.target.value)}
            />
            <p className="subtle">{form.photos.filter((item) => item.trim()).length} / {PHOTO_SLOT_COUNT} photos added. Add at least 2 to continue.</p>
            <p className="subtle">Select a slot first, then upload from your system or paste a direct image link.</p>
          </div>
        );
      case 'shareMore':
        return (
          <div className="onboardingFormSection stackedSections">
            <button
              type="button"
              className="dashedInfoCard"
              onClick={() => document.getElementById('share-more-bio')?.focus()}
            >
              <div>
                <strong>About me</strong>
                <p>Introduce yourself to make a strong impression.</p>
              </div>
              <span className="plusBadge">+</span>
            </button>

            <textarea
              id="share-more-bio"
              className="onboardingInput onboardingTextarea"
              placeholder="About me"
              value={form.bio}
              onChange={(event) => setForm({ ...form, bio: event.target.value })}
            />

            <button
              type="button"
              className="dashedInfoCard"
              onClick={() => document.getElementById('share-more-question')?.focus()}
            >
              <div>
                <strong>Select a prompt</strong>
                <p>Answer a prompt to show off your personality.</p>
              </div>
              <span className="plusBadge">+</span>
            </button>

            <select
              id="share-more-question"
              className="onboardingSelect"
              value={form.profilePrompts.standoutPromptQuestion}
              onChange={(event) => setForm({
                ...form,
                profilePrompts: {
                  ...form.profilePrompts,
                  standoutPromptQuestion: event.target.value
                }
              })}
            >
              <option value="">Choose a prompt</option>
              {STANDOUT_PROMPT_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <textarea
              className="onboardingInput onboardingTextarea"
              placeholder="Write your answer"
              value={form.profilePrompts.standoutPromptAnswer}
              onChange={(event) => setForm({
                ...form,
                profilePrompts: {
                  ...form.profilePrompts,
                  standoutPromptAnswer: event.target.value
                }
              })}
            />

            <div className="tipCard">
              <span className="tipIcon">!</span>
              <p>Adding a short intro about you could lead to <strong>25% more matches.</strong></p>
            </div>
          </div>
        );
      case 'avoidContacts':
        return (
          <div className="onboardingFormSection stackedSections">
            <div className="infoCopy">
              <p>It&apos;s easy to share contacts with BBC when using this feature to pick who you want to avoid.</p>
              <p>We&apos;ll store these blocked contacts so you can avoid seeing each other if that contact has an account with the same info you provide.</p>
            </div>

            <textarea
              className="onboardingInput onboardingTextarea"
              placeholder="Add phone numbers or emails, one per line"
              value={contactDraft}
              onChange={(event) => {
                setContactDraft(event.target.value);
                setForm({
                  ...form,
                  blockedContactIdentifiers: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean)
                });
              }}
            />

            {!!form.blockedContactIdentifiers.length && (
              <div className="tagGrid">
                {form.blockedContactIdentifiers.map((contact) => (
                  <span key={contact} className="savedContactChip">{contact}</span>
                ))}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  }

  const isLastStep = step === steps.length - 1;
  const progress = Math.round((step / (steps.length - 1)) * 100);
  const canSkipStep = ['shareMore', 'avoidContacts'].includes(steps[step].key);

  return (
    <section className="onboardingShell">
      <div className="onboardingPhone">
        <div className="onboardingProgressTrack">
          <div className="onboardingProgressFill" style={{ width: `${progress}%` }} />
        </div>

        <div className="onboardingHeader">
          <button
            type="button"
            className="iconButton"
            onClick={() => {
              if (step === 0) {
                navigate('/');
                return;
              }
              setStep((currentStep) => currentStep - 1);
            }}
          >
            {step === 0 ? '×' : '‹'}
          </button>
          <button
            type="button"
            className="skipButton"
            onClick={() => {
              if (canSkipStep) {
                if (isLastStep) {
                  saveStep({ complete: true });
                  return;
                }
                saveStep({ nextStep: step + 1 });
                return;
              }
            }}
          >
            {canSkipStep ? 'Skip' : ''}
          </button>
        </div>

        <div className="onboardingBody">
          <div className="onboardingIntro">
            <h1>{steps[step].title}</h1>
            <p>{steps[step].subtitle}</p>
          </div>

          {renderStepContent()}

          {message && <p className="notice">{message}</p>}
        </div>

        <div className="onboardingFooter">
          <button
            type="button"
            className="primaryCta"
            disabled={isSaving || !isCurrentStepValid()}
            onClick={() => {
              if (step === 0) {
                setStep(1);
                return;
              }
              if (isLastStep) {
                saveStep({ complete: true });
                return;
              }
              saveStep();
            }}
          >
            {isSaving ? 'Saving...' : isLastStep ? 'Finish' : step === 0 ? 'I agree' : 'Next'}
          </button>
        </div>
      </div>
    </section>
  );
}

function SwipePage({ token }) {
  const defaultDiscoverGender = 'Female';
  const [profiles, setProfiles] = useState([]);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({ maxAge: 35, gender: defaultDiscoverGender });
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const current = profiles[0];
  const upcomingProfiles = profiles.slice(0, 3);
  const navigate = useNavigate();

  async function loadProfiles() {
    try {
      const params = new URLSearchParams(filters).toString();
      const data = await apiFetch(`/api/users/discover?${params}`, { token });
      setProfiles(dedupeCards(data.users, (item) => item));
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadProfiles();
  }, []);

  async function refillProfilesIfNeeded(remainingProfiles = []) {
    if (remainingProfiles.length > 0) {
      return;
    }

    try {
      const params = new URLSearchParams(filters).toString();
      const data = await apiFetch(`/api/users/discover?${params}`, { token });
      setProfiles(dedupeCards(data.users || [], (item) => item));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSwipe(status) {
    if (!current) {
      return;
    }

    const swipedProfile = current;
    const remainingProfiles = profiles.slice(1);
    setProfiles(remainingProfiles);
    setDragX(0);
    setDragging(false);

    try {
      await apiFetch('/api/likes', {
        method: 'POST',
        token,
        body: { toUserId: swipedProfile._id, status }
      });
      const actionMessage = status === 'liked'
        ? `${swipedProfile.name} moved to liked by you.`
        : `${swipedProfile.name} was removed from your discover queue.`;
      setMessage(actionMessage);
      await refillProfilesIfNeeded(remainingProfiles);
    } catch (error) {
      setProfiles((prev) => [swipedProfile, ...prev]);
      setMessage(error.message);
    }
  }

  function handleQuickSwipe(event, status) {
    event.preventDefault();
    event.stopPropagation();
    handleSwipe(status);
  }

  function beginDrag(clientX) {
    dragStartXRef.current = clientX;
    setDragging(true);
  }

  function updateDrag(clientX) {
    if (!dragging) {
      return;
    }

    setDragX(clientX - dragStartXRef.current);
  }

  function endDrag() {
    if (!dragging) {
      return;
    }

    const threshold = 110;
    setDragging(false);
    if (dragX >= threshold) {
      handleSwipe('liked');
      return;
    }
    if (dragX <= -threshold) {
      handleSwipe('skipped');
      return;
    }
    setDragX(0);
  }

  async function handleRewind() {
    try {
      const data = await apiFetch('/api/users/rewind', { method: 'POST', token });
      setMessage(data.message);
      loadProfiles();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleModeration(action) {
    if (!current) {
      return;
    }

    try {
      if (action === 'block') {
        const data = await apiFetch(`/api/users/block/${current._id}`, { method: 'POST', token });
        setMessage(data.message);
      } else {
        const data = await apiFetch(`/api/users/report/${current._id}`, {
          method: 'POST',
          token,
          body: { reason: 'fake_profile', details: 'Reported from smart discover.' }
        });
        setMessage(data.message);
      }
      setProfiles((prev) => prev.slice(1));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleHeartProfile() {
    if (!current) {
      return;
    }

    try {
      const data = await connectToProfile(token, current._id);
      setMessage(`${data.message} Profile moved to chats.`);
      setProfiles((prev) => prev.slice(1));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleOpenChat() {
    if (!current) {
      return;
    }

    try {
      const data = await connectToProfile(token, current._id);
      setMessage(data.message);
      setProfiles((prev) => prev.slice(1));
      navigate(`/chat/${data.matchId}`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="grid twoCol discoverLayout">
      <article className="card discoverControlsCard">
        <h2>Smart filters</h2>
        <div className="form">
          <input type="number" value={18} disabled />
          <input type="number" placeholder="Max age" value={filters.maxAge} onChange={(e) => setFilters({ ...filters, maxAge: e.target.value })} />
          <select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
          <button onClick={loadProfiles}>Refresh smart queue</button>
          <button className="ghost" onClick={handleRewind}>Rewind swipe</button>
        </div>
      </article>

      <article className="card discoverDeckCard">
        <div className="discoverHeader">
          <div>
            <h2>Discover</h2>
            <p className="subtle">Drag right to like, drag left to cancel. The deck is filled with random image-backed profiles.</p>
          </div>
          <div className="discoverIndicators">
            <span className="badge">Queue {profiles.length}</span>
            {current?.isNearby && <span className="badge">Nearby</span>}
          </div>
        </div>
        {current ? (
          <div className="swipeExperience">
            <div className="swipeStage">
              {upcomingProfiles.slice().reverse().map((profile, reverseIndex) => {
                const actualIndex = upcomingProfiles.length - reverseIndex - 1;
                const isTopCard = actualIndex === 0;
                const style = getSwipeCardStyle(actualIndex, isTopCard ? dragX : 0);

                return (
                  <article
                    key={profile._id}
                    className={`swipeCard ${isTopCard ? 'active' : 'stacked'}`}
                    style={style}
                    onMouseDown={isTopCard ? (event) => beginDrag(event.clientX) : undefined}
                    onMouseMove={isTopCard ? (event) => updateDrag(event.clientX) : undefined}
                    onMouseUp={isTopCard ? endDrag : undefined}
                    onMouseLeave={isTopCard ? endDrag : undefined}
                    onTouchStart={isTopCard ? (event) => beginDrag(event.touches[0].clientX) : undefined}
                    onTouchMove={isTopCard ? (event) => updateDrag(event.touches[0].clientX) : undefined}
                    onTouchEnd={isTopCard ? endDrag : undefined}
                  >
                    <div className="swipePhotoWrap">
                      {profile.photos?.[0]
                        ? <img src={profile.photos[0]} alt={profile.name} />
                        : <div className="photoFallback">{profile.name[0]}</div>}
                      <div className="swipeGradient" />
                      {isTopCard && dragX > 50 && <div className="swipeDecision like">LIKE</div>}
                      {isTopCard && dragX < -50 && <div className="swipeDecision nope">NOPE</div>}
                      <div className="swipeCardContent">
                        <div className="scoreRow">
                          <span className="score">{profile.compatibilityScore}% match</span>
                          <span className="badge">{profile.distanceKm} km away</span>
                          {profile.boostedUntil && <span className="badge">Boosted</span>}
                        </div>
                        <h3>{profile.name}, {profile.age}</h3>
                        <p>{profile.location} • {profile.personalityAnswers?.datingIntent || 'Open to both'} • Activity {profile.activityScore || 0}</p>
                        <p>{profile.smartSuggestion}</p>
                        <div className="discoverInterestRow">
                          {(profile.interests || []).slice(0, 4).map((interest) => <span key={interest} className="pill">{interest}</span>)}
                        </div>
                        {isTopCard && (
                          <div className="swipeQuickActions">
                            <button
                              type="button"
                              className="danger swipeActionButton swipeArrowButton"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onTouchStart={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onClick={(event) => handleQuickSwipe(event, 'skipped')}
                              aria-label="Cancel profile"
                              title="Cancel"
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              className="swipeActionButton swipeArrowButton swipeArrowButtonLike"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onTouchStart={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onClick={(event) => handleQuickSwipe(event, 'liked')}
                              aria-label="Like profile"
                              title="Like"
                            >
                              →
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="discoverReasonPanel">
              <strong>Why this profile?</strong>
              <ul className="list">
                {(current.reasons || []).map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>

            <div className="discoverActionBar">
              <button className="ghost swipeActionButton" onClick={handleHeartProfile}>Heart</button>
              <button className="ghost swipeActionButton" onClick={handleOpenChat}>Chat</button>
              <button className="ghost swipeActionButton" onClick={() => handleModeration('report')}>Report</button>
              <button className="ghost swipeActionButton" onClick={() => handleModeration('block')}>Block</button>
            </div>
          </div>
        ) : (
          <p className="notice">No more compatible profiles right now.</p>
        )}
        {message && <p className="notice">{message}</p>}
      </article>
    </section>
  );
}

function MatchesPage({ token, user }) {
  const [matches, setMatches] = useState([]);
  const [suggestedMatches, setSuggestedMatches] = useState([]);
  const [receivedLikes, setReceivedLikes] = useState([]);
  const [sentLikes, setSentLikes] = useState([]);
  const [likedProfiles, setLikedProfiles] = useState([]);
  const [selectedGender, setSelectedGender] = useState(user?.interestedIn || 'Everyone');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setSelectedGender(user?.interestedIn || 'Everyone');
  }, [user?.interestedIn]);

  async function loadData(gender = selectedGender) {
    try {
      const matchesQuery = new URLSearchParams({ gender }).toString();
      const [matchesData, receivedData, sentData] = await Promise.all([
        apiFetch(`/api/matches?${matchesQuery}`, { token }),
        apiFetch('/api/likes/received', { token }),
        apiFetch('/api/likes/sent', { token })
      ]);
      setMatches(dedupeCards(matchesData.matches, (item) => item.otherUser));
      setSuggestedMatches(dedupeCards(matchesData.fallbackMatches || [], (item) => item.otherUser));
      setReceivedLikes(dedupeCards(receivedData.likes, (item) => item.fromUserId));
      setSentLikes(dedupeCards(sentData.likes, (item) => item.toUserId));
      setLikedProfiles(dedupeCards(sentData.likes, (item) => item.toUserId));
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedGender]);

  function isProfileAlreadyLiked(profile) {
    const targetKeys = new Set(getProfileLookupKeys(profile));
    return sentLikes.some((item) => getProfileLookupKeys(item?.toUserId).some((key) => targetKeys.has(key)));
  }

  function getSentLike(profile) {
    const targetKeys = new Set(getProfileLookupKeys(profile));
    return sentLikes.find((item) => getProfileLookupKeys(item?.toUserId).some((key) => targetKeys.has(key)));
  }

  function stopMatchCardAction(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function buildProfilePreview(profile) {
    return {
      name: profile?.name || '',
      gender: profile?.gender || '',
      location: profile?.location || '',
      photo: profile?.photos?.[0] || ''
    };
  }

  async function handleConnectSuggestion(match) {
    if (!match?.otherUser?._id) {
      setMessage('This profile is unavailable right now.');
      return;
    }

    try {
      const data = await connectToProfile(token, match.otherUser._id, buildProfilePreview(match.otherUser));
      setMessage(`${data.message} Added to your chats.`);
      setSuggestedMatches((prev) => prev.filter((item) => item._id !== match._id));
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleStarProfile(match) {
    if (!match?.otherUser?._id) {
      setMessage('This profile is unavailable right now.');
      return;
    }

    try {
      if (match._id && !String(match._id).startsWith('suggested-')) {
        const data = await updateMatchStar(token, match._id, !match.isStarred);
        setMessage(data.message);
        setMatches((prev) => prev.map((item) => item._id === match._id ? { ...item, isStarred: data.isStarred } : item));
        return;
      }

      const connected = await connectToProfile(token, match.otherUser._id, buildProfilePreview(match.otherUser));
      const starred = await updateMatchStar(token, connected.matchId, true);
      setMessage(starred.message);
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleLikeProfile(match) {
    if (!match?.otherUser?._id) {
      setMessage('This profile is unavailable right now.');
      return;
    }

    try {
      if (isProfileAlreadyLiked(match.otherUser)) {
        setMessage('This profile is already in your Likes section.');
        await loadData();
        return;
      }

      const data = await apiFetch('/api/likes', {
        method: 'POST',
        token,
        body: {
          toUserId: match.otherUser._id,
          status: 'liked',
          profilePreview: buildProfilePreview(match.otherUser)
        }
      });
      setMessage(data.message);
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleUnlikeProfile(profile) {
    if (!profile) {
      setMessage('This profile is unavailable right now.');
      return;
    }

    try {
      const likedItem = getSentLike(profile);
      const data = await apiFetch('/api/likes/sent/remove', {
        method: 'POST',
        token,
        body: likedItem?._id
          ? { likeId: likedItem._id }
          : { toUserId: normalizeId(profile._id) }
      });
      setMessage(data.message);
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleOpenProfileChat(match) {
    if (!match?.otherUser?._id) {
      setMessage('This profile is unavailable right now.');
      return;
    }

    try {
      const data = await connectToProfile(token, match.otherUser._id, buildProfilePreview(match.otherUser));
      setMessage(data.message);
      await loadData();
      navigate(`/chat/${data.matchId}`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleOpenLikedProfileChat(item) {
    if (!item?.toUserId?._id) {
      setMessage('Chat opens only for real profiles.');
      return;
    }

    try {
      const data = await connectToProfile(token, item.toUserId._id);
      setMessage(data.message);
      await loadData();
      navigate(`/chat/${data.matchId}`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleStarLikedProfile(item) {
    if (!item?.toUserId?._id) {
      setMessage('Star works only for real profiles.');
      return;
    }

    try {
      const connected = await connectToProfile(token, item.toUserId._id);
      const starred = await updateMatchStar(token, connected.matchId, true);
      setMessage(starred.message);
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <MatchesShell>
      <article className="card">
        <div className="sectionHeader">
          <div>
            <h2>Matches</h2>
            <p className="subtle">Filter your matches and suggestions by gender.</p>
          </div>
          <div className="actionsRow">
            <span className="badge">Showing {selectedGender}</span>
            <select value={selectedGender} onChange={(event) => setSelectedGender(event.target.value)}>
              {MATCH_GENDER_FILTER_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="matchGallery">
          {matches.map((match) => {
            const hobbies = getProfileHobbies(match.otherUser);
            const alreadyLiked = isProfileAlreadyLiked(match.otherUser);

            return (
              <MatchCard
                key={match._id}
                match={match}
                hobbies={hobbies}
                alreadyLiked={alreadyLiked}
                onLikeToggle={(event) => {
                  stopMatchCardAction(event);
                  if (alreadyLiked) {
                    handleUnlikeProfile(match.otherUser);
                    return;
                  }
                  handleLikeProfile(match);
                }}
                onStar={(event) => {
                  stopMatchCardAction(event);
                  handleStarProfile(match);
                }}
                onOpen={(event) => {
                  stopMatchCardAction(event);
                  navigate(`/chat/${match._id}`);
                }}
              />
            );
          })}
          {!matches.length && <p className="notice">No real matches yet. Suggested profiles are shown below.</p>}
          {suggestedMatches.map((match) => {
            const hobbies = getProfileHobbies(match.otherUser);
            const alreadyLiked = isProfileAlreadyLiked(match.otherUser);

            return (
              <MatchCard
                key={match._id}
                match={match}
                hobbies={hobbies}
                alreadyLiked={alreadyLiked}
                suggested
                onLikeToggle={() => (alreadyLiked ? handleUnlikeProfile(match.otherUser) : handleLikeProfile(match))}
                onStar={() => handleStarProfile(match)}
                onOpen={() => handleOpenProfileChat(match)}
              />
            );
          })}
          {!matches.length && !suggestedMatches.length && <p className="notice">No matches available right now.</p>}
        </div>
      </article>

      <article className="card">
        <h2>Likes</h2>
        <div className="likesColumn">
          <section className="stack">
            <h3>People who liked you</h3>
            {receivedLikes.map((item) => (
              <div key={item._id} className="listItem">
                <strong>{item.fromUserId?.name}</strong>
                <span>{user?.premium?.seeWhoLikedYou ? item.fromUserId?.location : 'Premium reveals full details instantly'}</span>
              </div>
            ))}
            {!receivedLikes.length && <p className="notice">No incoming likes yet.</p>}
          </section>

          <section className="stack">
            <h3>Sent likes</h3>
            {sentLikes.map((item) => (
              <div key={item._id} className="listItem">
                <strong>{item.toUserId?.name}</strong>
                <span>{item.toUserId?.location}</span>
              </div>
            ))}
            {!sentLikes.length && <p className="notice">No sent likes yet.</p>}
          </section>

          <section className="stack">
            <h3>User liked profiles</h3>
            {likedProfiles.map((item) => (
              <div key={`liked-profile-${item._id}`} className="listItem likedProfileItem">
                <strong>{item.toUserId?.name}</strong>
                <span>{item.toUserId?.location || 'Nearby'} {item.toUserId?.bio ? `• ${item.toUserId.bio}` : ''}</span>
                <div className="actionsRow">
                  <button className="ghost" onClick={() => handleUnlikeProfile(item.toUserId)}>Unlike</button>
                  <button className="ghost" onClick={() => handleStarLikedProfile(item)}>Star conversation</button>
                  <button onClick={() => handleOpenLikedProfileChat(item)}>Open chat</button>
                </div>
              </div>
            ))}
            {!likedProfiles.length && <p className="notice">No user liked profiles yet.</p>}
          </section>
        </div>
      </article>
      {message && <p className="notice">{message}</p>}
    </MatchesShell>
  );
}

function LikesPage({ token }) {
  const [likedProfiles, setLikedProfiles] = useState([]);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  async function loadLikes() {
    try {
      const sentData = await apiFetch('/api/likes/sent', { token });
      setLikedProfiles(dedupeCards(sentData.likes || [], (item) => item.toUserId));
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadLikes();
  }, []);

  async function handleOpenLikedProfileChat(item) {
    if (!item?.toUserId?._id) {
      setMessage('Chat opens only for real profiles.');
      return;
    }

    try {
      const data = await connectToProfile(token, item.toUserId._id);
      setMessage(data.message);
      await loadLikes();
      navigate(`/chat/${data.matchId}`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleRemoveLikedProfile(item) {
    if (!item?.toUserId?._id) {
      setMessage('Liked profile not found.');
      return;
    }

    try {
      const data = await apiFetch('/api/likes', {
        method: 'POST',
        token,
        body: {
          toUserId: item.toUserId._id,
          status: 'skipped'
        }
      });
      setMessage(data.message);
      setLikedProfiles((prev) => prev.filter((likedItem) => likedItem._id !== item._id));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleRemoveAllLikedProfiles() {
    try {
      await Promise.all(
        likedProfiles
          .filter((item) => item?.toUserId?._id)
          .map((item) => apiFetch('/api/likes', {
            method: 'POST',
            token,
            body: {
              toUserId: item.toUserId._id,
              status: 'skipped'
            }
          }))
      );
      setMessage('All liked profiles removed.');
      setLikedProfiles([]);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="card">
      <div className="sectionHeader">
        <div>
          <h2>Likes</h2>
          <p className="subtle">All profiles you liked appear here. Open chat with any profile from this list.</p>
        </div>
        <div className="actionsRow">
          <span className="badge">Profiles {likedProfiles.length}</span>
          <button type="button" className="ghost" onClick={handleRemoveAllLikedProfiles} disabled={!likedProfiles.length}>Remove all</button>
        </div>
      </div>

      <div className="matchGallery">
        {likedProfiles.map((item) => (
          <ProfileCard
            key={`likes-page-${item._id}`}
            profile={item.toUserId}
            badge={(
              <>
                <span className="badge">Liked by you</span>
                {item.toUserId?.gender && <span className="badge">{item.toUserId.gender}</span>}
              </>
            )}
            subtitle={`${item.toUserId?.location || 'Nearby'}${item.toUserId?.age ? ` • ${item.toUserId.age}` : ''}`}
            body={item.toUserId?.bio}
            actions={(
              <>
                <button type="button" onClick={() => handleOpenLikedProfileChat(item)}>Chat</button>
                <button type="button" className="ghost" onClick={() => handleRemoveLikedProfile(item)}>Remove</button>
              </>
            )}
          />
        ))}
        {!likedProfiles.length && <p className="notice">No liked profiles yet. Like profiles in Discover and they will appear here.</p>}
      </div>

      {message && <p className="notice">{message}</p>}
    </section>
  );
}

function ChatPage({ token, socket }) {
  const { matchId } = useParams();
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [matchMeta, setMatchMeta] = useState(null);
  const [icebreakers, setIcebreakers] = useState([]);
  const [suggestedReplies, setSuggestedReplies] = useState([]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [activeMessageMenu, setActiveMessageMenu] = useState(null);
  const [activeDeleteMessage, setActiveDeleteMessage] = useState(null);
  const chatBoxRef = useRef(null);
  const holdTimerRef = useRef(null);

  async function loadMessages() {
    try {
      const data = await apiFetch(`/api/matches/${matchId}/messages`, { token });
      setMessages(data.messages);
      setOtherUser(data.otherUser);
      setMatchMeta(data.match || null);
      setIcebreakers(data.icebreakers || []);
      setSuggestedReplies(data.suggestedReplies || []);
      await apiFetch(`/api/matches/${matchId}/messages/seen`, { method: 'PATCH', token });
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadMessages();
  }, [matchId]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    function onNewMessage(payload) {
      if (payload.matchId === matchId) {
        setMessages((prev) => prev.some((item) => item._id === payload._id) ? prev : [...prev, payload]);
      }
    }

    function onDeletedMessage(payload) {
      if (payload.matchId !== matchId) {
        return;
      }

      if (payload.scope === 'me') {
        setMessages((prev) => prev.filter((item) => item._id !== payload.messageId));
        return;
      }

      setMessages((prev) => prev.map((item) => item._id === payload.messageId
        ? { ...item, messageText: 'Message deleted', deletedForEveryone: true }
        : item));
    }

    socket.on('message:new', onNewMessage);
    socket.on('message:deleted', onDeletedMessage);
    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:deleted', onDeletedMessage);
    };
  }, [socket, matchId]);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  async function sendMessage(event, payloadOverride) {
    if (event) {
      event.preventDefault();
    }

    const payload = payloadOverride || { messageText: text, messageType: 'text' };
    try {
      const data = await apiFetch(`/api/matches/${matchId}/messages`, {
        method: 'POST',
        token,
        body: payload
      });
      setMessages((prev) => [...prev, data.data]);
      setText('');
      setIcebreakers([]);
      loadMessages();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function beginMessageHold(item, isOwn) {
    if (!isOwn || item.deletedForEveryone) {
      return;
    }

    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      setActiveMessageMenu(item);
      holdTimerRef.current = null;
    }, 450);
  }

  async function deleteMessage(messageId, scope) {
    try {
      const data = await apiFetch(`/api/matches/${matchId}/messages/${messageId}`, {
        method: 'DELETE',
        token,
        body: { scope }
      });
      setMessage(data.message);
      setActiveMessageMenu(null);
      setActiveDeleteMessage(null);
      setMessages((prev) => {
        if (scope === 'me') {
          return prev.filter((item) => item._id !== messageId);
        }

        return prev.map((item) => item._id === messageId
          ? { ...item, messageText: 'Message deleted', deletedForEveryone: true }
          : item);
      });
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleConversationStar() {
    try {
      const data = await updateMatchStar(token, matchId, !matchMeta?.isStarred);
      setMatchMeta((prev) => ({ ...(prev || {}), _id: matchId, isStarred: data.isStarred }));
      setMessage(data.message);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="dmShell">
      <article className="card dmCard">
        <div className="dmHeader">
          <div className="dmProfileBlock">
            <Link className="dmBackLink" to="/chat">←</Link>
            <div className="dmAvatar">
              {otherUser?.photos?.[0]
                ? <img src={otherUser.photos[0]} alt={otherUser?.name || 'Match'} />
                : <div className="photoFallback">{otherUser?.name?.[0] || '?'}</div>}
            </div>
            <div>
              <h2>{otherUser?.name || 'Match'}</h2>
              <p className="subtle">{otherUser?.location || 'Nearby'} • {matchMeta?.isStarred ? 'Starred chat' : 'Active now'}</p>
            </div>
          </div>
          <div className="actionsRow">
            <button className="ghost" onClick={toggleConversationStar}>{matchMeta?.isStarred ? 'Unstar' : 'Star'}</button>
          </div>
        </div>

        <div className="dmQuickActions">
          {!!icebreakers.length && icebreakers.slice(0, 3).map((prompt) => (
            <button key={prompt} className="ghost" onClick={() => sendMessage(null, { messageText: prompt, messageType: 'game_prompt', suggestionTag: 'icebreaker' })}>{prompt}</button>
          ))}
          {!!suggestedReplies.length && suggestedReplies.slice(0, 2).map((reply) => (
            <button key={reply} className="ghost" onClick={() => sendMessage(null, { messageText: reply, messageType: 'text', suggestionTag: 'ai_reply' })}>{reply}</button>
          ))}
          <button className="ghost" onClick={() => sendMessage(null, { messageText: 'Sending a fun GIF vibe 😄', messageType: 'gif', mediaUrl: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif' })}>GIF</button>
          <button className="ghost" onClick={() => sendMessage(null, { messageText: 'Sticker dropped ✨', messageType: 'sticker', mediaUrl: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=400&q=80' })}>Sticker</button>
        </div>

        <div className="dmMessages" ref={chatBoxRef}>
          <MessageList
            messages={messages}
            otherUser={otherUser}
            normalizeId={normalizeId}
            formatRelativeTime={formatRelativeTime}
            beginMessageHold={beginMessageHold}
            clearHoldTimer={clearHoldTimer}
          />
        </div>

        {activeMessageMenu && !activeDeleteMessage && (
          <div className="dmDeleteSheet" onClick={() => setActiveMessageMenu(null)}>
            <div className="dmDeleteMenuCard" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="ghost" onClick={() => {
                setActiveDeleteMessage(activeMessageMenu);
                setActiveMessageMenu(null);
              }}>
                Delete
              </button>
              <button type="button" className="ghost" onClick={() => setActiveMessageMenu(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {activeDeleteMessage && (
          <div className="dmDeleteSheet" onClick={() => setActiveDeleteMessage(null)}>
            <div className="dmDeleteSheetCard" onClick={(event) => event.stopPropagation()}>
              <h3>Delete message</h3>
              <button type="button" onClick={() => deleteMessage(activeDeleteMessage._id, 'everyone')}>Delete from everyone</button>
              <button type="button" className="ghost" onClick={() => deleteMessage(activeDeleteMessage._id, 'me')}>Delete from me</button>
              <button type="button" className="ghost" onClick={() => setActiveDeleteMessage(null)}>Cancel</button>
            </div>
          </div>
        )}

        <form className="dmComposer" onSubmit={sendMessage}>
          <button type="button" className="cameraButton" onClick={() => sendMessage(null, { messageText: 'Truth or Dare?', messageType: 'game_prompt', suggestionTag: 'truth_or_dare' })} aria-label="Send fun prompt">
            <span>📷</span>
          </button>
          <input placeholder="Message..." value={text} onChange={(e) => setText(e.target.value)} />
          <button>Send</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </article>
    </section>
  );
}

function ChatBuilderPage({ token, user }) {
  const [matches, setMatches] = useState([]);
  const [suggestedMatches, setSuggestedMatches] = useState([]);
  const [sentLikes, setSentLikes] = useState([]);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  function buildProfilePreview(profile) {
    return {
      name: profile?.name || '',
      gender: profile?.gender || '',
      location: profile?.location || '',
      photo: profile?.photos?.[0] || ''
    };
  }

  async function loadChatData() {
    try {
      const [matchesData, sentLikesData] = await Promise.all([
        apiFetch('/api/matches', { token }),
        apiFetch('/api/likes/sent', { token })
      ]);
      setMatches(dedupeCards(matchesData.matches || [], (item) => item.otherUser));
      setSuggestedMatches(dedupeCards(matchesData.fallbackMatches || [], (item) => item.otherUser).slice(0, 6));
      setSentLikes(dedupeCards(sentLikesData.likes || [], (item) => item.toUserId));
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadChatData();
  }, []);

  async function handleLikeProfile(match) {
    if (!match?.otherUser?._id) {
      setMessage('This profile is unavailable right now.');
      return;
    }

    try {
      const data = await apiFetch('/api/likes', {
        method: 'POST',
        token,
        body: {
          toUserId: match.otherUser._id,
          status: 'liked',
          profilePreview: buildProfilePreview(match.otherUser)
        }
      });
      setMessage(data.message);
      await loadChatData();
      navigate('/likes');
    } catch (error) {
      setMessage(error.message);
    }
  }

  function isProfileAlreadyLiked(profile) {
    const targetKeys = new Set(getProfileLookupKeys(profile));
    return sentLikes.some((item) => getProfileLookupKeys(item?.toUserId).some((key) => targetKeys.has(key)));
  }

  function getSentLike(profile) {
    const targetKeys = new Set(getProfileLookupKeys(profile));
    return sentLikes.find((item) => getProfileLookupKeys(item?.toUserId).some((key) => targetKeys.has(key)));
  }

  async function handleUnlikeProfile(profile) {
    if (!profile) {
      setMessage('This profile is unavailable right now.');
      return;
    }

    try {
      const likedItem = getSentLike(profile);
      const data = await apiFetch('/api/likes/sent/remove', {
        method: 'POST',
        token,
        body: likedItem?._id
          ? { likeId: likedItem._id }
          : { toUserId: normalizeId(profile._id) }
      });
      setMessage(data.message);
      await loadChatData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleConnectProfile(match) {
    if (!match?.otherUser?._id) {
      setMessage('This profile is unavailable right now.');
      return;
    }

    try {
      const data = await connectToProfile(token, match.otherUser._id, buildProfilePreview(match.otherUser));
      setMessage(data.message);
      await loadChatData();
      return data;
    } catch (error) {
      setMessage(error.message);
      return null;
    }
  }

  async function handleToggleMatchStar(match) {
    try {
      const data = await updateMatchStar(token, match._id, !match.isStarred);
      setMessage(data.message);
      setMatches((prev) => prev.map((item) => item._id === match._id ? { ...item, isStarred: data.isStarred } : item));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleOpenChat(match) {
    const data = await handleConnectProfile(match);
    if (data?.matchId) {
      navigate(`/chat/${data.matchId}`);
    }
  }

  const pinnedMatches = [...matches].sort((a, b) => {
    if (Boolean(a.isStarred) !== Boolean(b.isStarred)) {
      return Number(Boolean(b.isStarred)) - Number(Boolean(a.isStarred));
    }

    const aDate = new Date(a.lastMessage?.createdAt || a.lastMessageAt || a.createdAt || 0).getTime();
    const bDate = new Date(b.lastMessage?.createdAt || b.lastMessageAt || b.createdAt || 0).getTime();
    return bDate - aDate;
  });

  return (
    <MessagesShell>
      <article className="card inboxCard">
        <div className="inboxHeader">
          <h2>Messages</h2>
          <button type="button" className="requestsButton">Requests</button>
        </div>

        <div className="inboxList">
          {pinnedMatches.map((match) => {
            const preview = buildChatPreview(match, user?._id);
            const hasUnread = Boolean(match.lastMessage && !match.lastMessage.seen && normalizeId(match.lastMessage.receiverId) === normalizeId(user?._id));

            return (
              <button key={match._id} type="button" className="inboxRow" onClick={() => navigate(`/chat/${match._id}`)}>
                <div className="inboxAvatar">
                  {match.otherUser?.photos?.[0]
                    ? <img src={match.otherUser.photos[0]} alt={match.otherUser?.name || 'Match'} />
                    : <div className="photoFallback">{match.otherUser?.name?.[0] || '?'}</div>}
                </div>
                <div className="inboxMeta">
                  <div className="inboxNameRow">
                    <strong>{match.otherUser?.name || 'New match'}</strong>
                    {match.isStarred && <span className="miniBadge">Starred</span>}
                  </div>
                  <div className="inboxPreviewRow">
                    <span className={`inboxPreview ${hasUnread ? 'unread' : ''}`}>{preview}</span>
                    <span className="inboxTime">{formatRelativeTime(match.lastMessage?.createdAt || match.lastMessageAt || match.createdAt)}</span>
                  </div>
                </div>
                <div className="inboxActions" onClick={(event) => event.stopPropagation()}>
                  {hasUnread && <span className="unreadDot" />}
                  <button type="button" className="cameraButton" onClick={() => navigate(`/chat/${match._id}`)} aria-label={`Open chat with ${match.otherUser?.name || 'match'}`}>
                    <span>📷</span>
                  </button>
                </div>
              </button>
            );
          })}

          {!pinnedMatches.length && <p className="notice">No active chats yet. Start from a match or suggested profile.</p>}
        </div>
      </article>

      <article className="card inboxSuggestionsCard">
        <div className="sectionHeader">
          <div>
            <h3>Open Chat With Random Matches</h3>
            <p className="subtle">Every real suggested profile can be moved into your matches and opened as a chat instantly.</p>
          </div>
        </div>

        <div className="stack">
          {suggestedMatches.map((match) => {
            const alreadyLiked = isProfileAlreadyLiked(match.otherUser);

            return (
              <div key={match._id} className="inboxSuggestionRow">
                <div className="inboxSuggestionProfile">
                  <div className="inboxMiniAvatar">
                    {match.otherUser?.photos?.[0]
                      ? <img src={match.otherUser.photos[0]} alt={match.otherUser?.name || 'Suggested match'} />
                      : <div className="photoFallback">{match.otherUser?.name?.[0] || '?'}</div>}
                  </div>
                  <div className="inboxSuggestionCopy">
                    <strong>{match.otherUser?.name}</strong>
                    <span>{match.compatibilityScore}% match • {match.otherUser?.location || 'Nearby'}</span>
                    <span>{match.otherUser?.bio || match.smartSuggestion || 'Suggested chat starter for you.'}</span>
                  </div>
                </div>
                <div className="actionsRow">
                  <button onClick={() => (alreadyLiked ? handleUnlikeProfile(match.otherUser) : handleLikeProfile(match))}>
                    {alreadyLiked ? 'Unlike' : 'Like'}
                  </button>
                  <button className="ghost" onClick={() => handleConnectProfile(match)}>Add to matches</button>
                  <button className="ghost" onClick={() => handleOpenChat(match)}>Chat now</button>
                </div>
              </div>
            );
          })}
          {!suggestedMatches.length && <p className="notice">No random profiles available right now.</p>}
        </div>
      </article>
      {message && <p className="notice">{message}</p>}
    </MessagesShell>
  );
}

function SettingsPage({ token, user, refreshUser, onLogout }) {
  const navigate = useNavigate();
  const photoInputRef = useRef(null);
  const [privacy, setPrivacy] = useState({
    profileVisible: Boolean(user?.profileVisible),
    allowMessages: Boolean(user?.allowMessages),
    travelModeEnabled: Boolean(user?.travelModeEnabled),
    travelLocation: user?.travelLocation || '',
    latitude: user?.latitude || '',
    longitude: user?.longitude || ''
  });
  const [photos, setPhotos] = useState(() => padPhotoSlots(user?.photos || []));
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPhotos(padPhotoSlots(user?.photos || []));
  }, [user]);

  async function savePrivacy(event) {
    event.preventDefault();
    try {
      const data = await apiFetch('/api/settings/privacy', {
        method: 'PUT',
        token,
        body: {
          ...privacy,
          latitude: privacy.latitude ? Number(privacy.latitude) : null,
          longitude: privacy.longitude ? Number(privacy.longitude) : null
        }
      });
      refreshUser(data.user);
      setMessage(data.message);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    try {
      const data = await apiFetch('/api/settings/password', { method: 'PUT', token, body: passwords });
      setMessage(data.message);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function updatePhotoAtIndex(index, value) {
    const nextPhotos = [...photos];
    nextPhotos[index] = value;
    setPhotos(nextPhotos);
  }

  async function handlePhotoFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setMessage('Please choose an image file.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      updatePhotoAtIndex(activePhotoIndex, dataUrl);
      setMessage(`Photo ${activePhotoIndex + 1} added from your device.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      event.target.value = '';
    }
  }

  function handlePhotoUrlChange(value) {
    updatePhotoAtIndex(activePhotoIndex, value);
  }

  function removeActivePhoto() {
    updatePhotoAtIndex(activePhotoIndex, '');
    setMessage(`Photo ${activePhotoIndex + 1} removed.`);
  }

  async function saveProfilePhotos() {
    try {
      const nextPhotos = normalizePhotoList(photos);
      const data = await apiFetch('/api/users/profile', {
        method: 'PUT',
        token,
        body: { photos: nextPhotos }
      });
      refreshUser(data.user);
      setPhotos(padPhotoSlots(data.user?.photos || []));
      setMessage(`Profile photos updated. Quality score: ${data.quality?.qualityScore || 0}`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteAccount() {
    if (!window.confirm('Delete your account permanently?')) {
      return;
    }
    await apiFetch('/api/settings/account', { method: 'DELETE', token });
    onLogout();
    navigate('/');
  }

  return (
    <section className="grid twoCol">
      <article className="card">
        <h2>Privacy, location, and travel mode</h2>
        <form className="form" onSubmit={savePrivacy}>
          <label className="toggle"><input type="checkbox" checked={privacy.profileVisible} onChange={(e) => setPrivacy({ ...privacy, profileVisible: e.target.checked })} />Visible in discovery</label>
          <label className="toggle"><input type="checkbox" checked={privacy.allowMessages} onChange={(e) => setPrivacy({ ...privacy, allowMessages: e.target.checked })} />Allow messages</label>
          <label className="toggle"><input type="checkbox" checked={privacy.travelModeEnabled} onChange={(e) => setPrivacy({ ...privacy, travelModeEnabled: e.target.checked })} />Travel mode</label>
          <input placeholder="Travel city" value={privacy.travelLocation} onChange={(e) => setPrivacy({ ...privacy, travelLocation: e.target.value })} />
          <input placeholder="Latitude" value={privacy.latitude} onChange={(e) => setPrivacy({ ...privacy, latitude: e.target.value })} />
          <input placeholder="Longitude" value={privacy.longitude} onChange={(e) => setPrivacy({ ...privacy, longitude: e.target.value })} />
          <button>Save settings</button>
        </form>
      </article>

      <article className="card">
        <h2>Profile photos</h2>
        <p className="subtle">Add your own photos so your profile shows real pictures everywhere in the app.</p>
        <div className="photoSlots">
          {photos.map((photo, index) => (
            <button
              key={`settings-photo-${index + 1}`}
              type="button"
              className={`photoSlot${activePhotoIndex === index ? ' active' : ''}${photo ? ' filled' : ''}`}
              onClick={() => setActivePhotoIndex(index)}
            >
              {photo ? <img src={photo} alt={`Profile photo ${index + 1}`} /> : <span>+</span>}
            </button>
          ))}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hiddenFileInput"
          onChange={handlePhotoFileChange}
        />
        <div className="photoActionRow">
          <button
            type="button"
            className="photoPickerButton"
            onClick={() => photoInputRef.current?.click()}
          >
            Upload from device
          </button>
          <button
            type="button"
            className="ghost"
            onClick={removeActivePhoto}
            disabled={!photos[activePhotoIndex]}
          >
            Remove selected photo
          </button>
          <button
            type="button"
            className="ghost"
            onClick={saveProfilePhotos}
          >
            Save profile photos
          </button>
        </div>
        <input
          placeholder={`Paste image URL for photo ${activePhotoIndex + 1}`}
          value={photos[activePhotoIndex]}
          onChange={(e) => handlePhotoUrlChange(e.target.value)}
        />
        <p className="subtle">{photos.filter((item) => item.trim()).length} / {PHOTO_SLOT_COUNT} photos added.</p>
      </article>

      <article className="card">
        <h2>Change password</h2>
        <form className="form" onSubmit={changePassword}>
          <input type="password" placeholder="Current password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} />
          <input type="password" placeholder="New password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} />
          <button>Update password</button>
        </form>
      </article>

      <article className="card">
        <h2>Danger zone</h2>
        <button className="danger" onClick={deleteAccount}>Delete account</button>
      </article>

      {message && <p className="notice">{message}</p>}
    </section>
  );
}

function AdminDashboardPage({ token }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    apiFetch('/api/admin/stats', { token }).then(setStats).catch(() => {});
  }, []);

  if (!stats) {
    return <section className="card"><p>Loading admin stats...</p></section>;
  }

  return (
    <section className="grid threeCol">
      <article className="card"><h2>Total users</h2><p className="metric">{stats.totalUsers}</p></article>
      <article className="card"><h2>Total matches</h2><p className="metric">{stats.totalMatches}</p></article>
      <article className="card"><h2>Total reports</h2><p className="metric">{stats.totalReports}</p></article>
      <article className="card"><h2>Active users</h2><p className="metric">{stats.activeUsers}</p></article>
      <article className="card"><h2>Premium users</h2><p className="metric">{stats.premiumUsers}</p></article>
      <article className="card"><h2>Low-quality hidden</h2><p className="metric">{stats.lowQualityHidden}</p></article>
    </section>
  );
}

function AdminUsersPage({ token }) {
  const [users, setUsers] = useState([]);

  async function loadUsers() {
    const data = await apiFetch('/api/admin/users', { token });
    setUsers(data.users);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function updateUser(userId, action) {
    await apiFetch(`/api/admin/users/${userId}/${action}`, { method: 'PATCH', token });
    loadUsers();
  }

  async function removeUser(userId) {
    await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE', token });
    loadUsers();
  }

  return (
    <section className="card">
      <h2>Admin user moderation</h2>
      <div className="stack">
        {users.map((item) => (
          <div key={item._id} className="listItem spread">
            <div>
              <strong>{item.name}</strong>
              <span>{item.email || item.phone || 'No contact'} • Quality {item.qualityScore || 0} • Flags {item.moderationFlags || 0}</span>
            </div>
            <div className="actionsRow">
              <button onClick={() => updateUser(item._id, 'block')}>Block</button>
              <button onClick={() => updateUser(item._id, 'unblock')}>Unblock</button>
              <button className="danger" onClick={() => removeUser(item._id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminReportsPage({ token }) {
  const [reports, setReports] = useState([]);

  async function loadReports() {
    const data = await apiFetch('/api/admin/reports', { token });
    setReports(data.reports);
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function setStatus(reportId, status) {
    await apiFetch(`/api/admin/reports/${reportId}`, { method: 'PATCH', token, body: { status } });
    loadReports();
  }

  return (
    <section className="card">
      <h2>Reports and AI moderation flags</h2>
      <div className="stack">
        {reports.map((item) => (
          <div key={item._id} className="listItem spread">
            <div>
              <strong>{item.reason}</strong>
              <span>{item.reporterId?.name} → {item.reportedUserId?.name}</span>
              <span>{item.source} • {item.details}</span>
            </div>
            <div className="actionsRow">
              <button onClick={() => setStatus(item._id, 'reviewed')}>Review</button>
              <button onClick={() => setStatus(item._id, 'resolved')}>Resolve</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AppRoutes() {
  const { token, user, saveSession, updateUser, clearSession } = useStoredSession();
  const [notifications, setNotifications] = useState({});
  const [socket, setSocket] = useState(null);

  async function loadUserState() {
    if (!token) {
      return;
    }

    try {
      const [me, summary] = await Promise.all([
        apiFetch('/api/auth/me', { token }),
        apiFetch('/api/notifications/summary', { token })
      ]);
      updateUser(me.user);
      setNotifications(summary);
    } catch (error) {
      clearSession();
    }
  }

  useEffect(() => {
    loadUserState();
  }, [token]);

  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const nextSocket = io(getSocketUrl(), { auth: { token } });
    setSocket(nextSocket);

    function refreshSummary() {
      apiFetch('/api/notifications/summary', { token }).then(setNotifications).catch(() => {});
    }

    nextSocket.on('match:new', refreshSummary);
    nextSocket.on('like:received', refreshSummary);
    nextSocket.on('message:new', refreshSummary);

    return () => {
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [token]);

  return (
    <Layout user={user} notifications={notifications} onLogout={clearSession}>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={user ? <Navigate to={needsOnboarding(user) ? '/setup-profile' : '/matches'} replace /> : <AuthPage onSession={saveSession} />} />
        <Route path="/setup-profile" element={<ProtectedRoute user={user}>{needsOnboarding(user) ? <ProfileSetupPage token={token} user={user} refreshUser={updateUser} /> : <Navigate to="/matches" replace />}</ProtectedRoute>} />
        <Route path="/swipe" element={<ProtectedRoute user={user}>{needsOnboarding(user) ? <Navigate to="/setup-profile" replace /> : <SwipePage token={token} />}</ProtectedRoute>} />
        <Route path="/matches" element={<ProtectedRoute user={user}>{needsOnboarding(user) ? <Navigate to="/setup-profile" replace /> : <MatchesPage token={token} user={user} />}</ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute user={user}>{needsOnboarding(user) ? <Navigate to="/setup-profile" replace /> : <ChatBuilderPage token={token} user={user} />}</ProtectedRoute>} />
        <Route path="/likes" element={<ProtectedRoute user={user}>{needsOnboarding(user) ? <Navigate to="/setup-profile" replace /> : <LikesPage token={token} />}</ProtectedRoute>} />
        <Route path="/chat/:matchId" element={<ProtectedRoute user={user}>{needsOnboarding(user) ? <Navigate to="/setup-profile" replace /> : <ChatPage token={token} socket={socket} />}</ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute user={user}>{needsOnboarding(user) ? <Navigate to="/setup-profile" replace /> : <SettingsPage token={token} user={user} refreshUser={updateUser} onLogout={clearSession} />}</ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<AdminRoute user={user}><AdminDashboardPage token={token} /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute user={user}><AdminUsersPage token={token} /></AdminRoute>} />
        <Route path="/admin/reports" element={<AdminRoute user={user}><AdminReportsPage token={token} /></AdminRoute>} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

const styles = `
  :root {
    font-family: "Space Grotesk", "Segoe UI", sans-serif;
    color: #1d1d1d;
  }
  html, body, #root {
    min-height: 100%;
  }
  body {
    font-family: "Space Grotesk", "Segoe UI", sans-serif;
    color: #1d1d1d;
    background-color: #fff8f2;
    background:
      radial-gradient(circle at top left, rgba(255, 212, 186, 0.7), transparent 30%),
      radial-gradient(circle at top right, rgba(251, 120, 89, 0.28), transparent 22%),
      linear-gradient(180deg, #fff6ee 0%, #fffdfa 100%);
    background-attachment: fixed;
  }
  * { box-sizing: border-box; }
  body { margin: 0; }
  a { color: inherit; text-decoration: none; }
  button, input, textarea, select {
    font: inherit;
    border-radius: 14px;
    border: 1px solid #e4ccb8;
    padding: 0.85rem 1rem;
  }
  .shell, .shellOnboarding {
    color: #1d1d1d;
  }
  button {
    background: linear-gradient(135deg, #ff6b4a, #ff9b64);
    color: white;
    border: none;
    cursor: pointer;
    font-weight: 700;
  }
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  button.ghost {
    background: #fff1e8;
    color: #ad5126;
  }
  button.danger {
    background: linear-gradient(135deg, #ba1b1b, #e2574c);
  }
  .shell {
    width: min(1220px, calc(100% - 2rem));
    margin: 0 auto;
    padding: 1.2rem 0 3rem;
  }
  .shellOnboarding {
    width: 100%;
    min-height: 100vh;
    padding: 0;
  }
  .topbar, .heroCard, .card, .listItem, .message {
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(228, 204, 184, 0.95);
    box-shadow: 0 24px 80px rgba(125, 75, 31, 0.08);
  }
  .topbar {
    border-radius: 26px;
    padding: 1.2rem 1.4rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .brand { font-size: 1.7rem; font-weight: 800; }
  .subtle { margin: 0.35rem 0 0; color: #7f5d4b; }
  .nav, .pillRow, .actionsRow {
    display: flex;
    gap: 0.65rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .heroCard {
    border-radius: 24px;
    padding: 1rem 1.3rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    gap: 1rem;
  }
  .profileHeading {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
  .profileIcon {
    width: 2.1rem;
    height: 2.1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: linear-gradient(135deg, #fff2ea, #ffd8c2);
    color: #ad5126;
    box-shadow: inset 0 0 0 1px rgba(228, 204, 184, 0.95);
    flex-shrink: 0;
  }
  .profileIcon svg {
    width: 1.2rem;
    height: 1.2rem;
    fill: currentColor;
  }
  .grid { display: grid; gap: 1rem; }
  .twoCol { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .threeCol { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .card {
    border-radius: 24px;
    padding: 1.25rem;
  }
  .heroLarge h1 {
    font-size: clamp(2rem, 5vw, 4rem);
    line-height: 0.95;
    margin-top: 0;
  }
  .cta {
    display: inline-flex;
    margin-top: 1rem;
    background: #1f1f1f;
    color: white;
    padding: 0.9rem 1.1rem;
    border-radius: 999px;
  }
  .pill {
    background: #fff2ea;
    color: #a14d24;
    padding: 0.45rem 0.85rem;
    border-radius: 999px;
    font-weight: 700;
  }
  .list, .stack {
    display: grid;
    gap: 0.75rem;
    padding-left: 1rem;
  }
  .form { display: grid; gap: 0.8rem; }
  .authCard { align-content: start; }
  .interestsSelector {
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
    border-radius: 20px;
    border: 1px solid #ecd3be;
    background: linear-gradient(180deg, rgba(255, 248, 243, 0.95), rgba(255, 255, 255, 0.95));
  }
  .interestsHeader {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  .interestSearch {
    background: white;
  }
  .selectedInterestBox {
    display: grid;
    gap: 0.75rem;
    padding: 0.9rem;
    border-radius: 18px;
    background: rgba(255, 241, 232, 0.8);
    border: 1px solid #ecd3be;
  }
  .interestCategoryList {
    display: grid;
    gap: 1rem;
  }
  .interestCategory {
    display: grid;
    gap: 0.75rem;
  }
  .interestCategoryTitle {
    font-weight: 800;
    color: #8c4522;
  }
  .chipGrid {
    display: flex;
    gap: 0.65rem;
    flex-wrap: wrap;
  }
  .interestChip {
    border: 1px solid #e8cfbb;
    background: white;
    color: #6d472f;
    border-radius: 999px;
    padding: 0.7rem 0.95rem;
    transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, color 180ms ease;
  }
  .interestChip:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 14px 24px rgba(125, 75, 31, 0.12);
    background: #fff5ef;
  }
  .interestChip.selected {
    background: linear-gradient(135deg, #ff6b4a, #ff9b64);
    color: white;
    box-shadow: 0 14px 28px rgba(255, 107, 74, 0.22);
  }
  .interestChip:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .notice {
    background: #fff4cf;
    color: #735200;
    border-radius: 16px;
    padding: 0.85rem 1rem;
  }
  .profileCard { display: grid; gap: 1rem; }
  .matchesLayout {
    grid-template-columns: minmax(0, 1.8fr) minmax(300px, 0.85fr);
    align-items: start;
  }
  .discoverLayout {
    grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.2fr);
    align-items: start;
  }
  .discoverControlsCard, .discoverDeckCard {
    border-radius: 30px;
  }
  .discoverHeader {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .discoverIndicators {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .swipeExperience {
    display: grid;
    gap: 1rem;
  }
  .swipeStage {
    position: relative;
    min-height: 680px;
    padding-bottom: 1rem;
  }
  .swipeCard {
    position: absolute;
    inset: 0;
    border-radius: 34px;
    overflow: hidden;
    background: #16181f;
    box-shadow: 0 30px 90px rgba(17, 20, 29, 0.24);
    transition: transform 220ms ease, opacity 220ms ease;
    user-select: none;
    touch-action: pan-y;
  }
  .swipeCard.active {
    cursor: grab;
  }
  .swipeCard.active:active {
    cursor: grabbing;
  }
  .swipePhotoWrap, .swipePhotoWrap img {
    width: 100%;
    height: 100%;
  }
  .swipePhotoWrap img {
    object-fit: cover;
    display: block;
  }
  .swipeGradient {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(11, 13, 18, 0.06) 0%, rgba(11, 13, 18, 0.2) 42%, rgba(11, 13, 18, 0.84) 100%);
  }
  .swipeCardContent {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 1.4rem;
    display: grid;
    gap: 0.75rem;
    color: white;
  }
  .swipeCardContent h3 {
    margin: 0;
    font-size: clamp(1.8rem, 4vw, 2.9rem);
    letter-spacing: -0.05em;
  }
  .swipeCardContent p {
    margin: 0;
    color: rgba(255, 255, 255, 0.9);
  }
  .discoverInterestRow {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }
  .swipeQuickActions {
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-top: 1rem;
  }
  .discoverInterestRow .pill {
    background: rgba(255, 255, 255, 0.16);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }
  .swipeDecision {
    position: absolute;
    top: 1.6rem;
    padding: 0.45rem 0.85rem;
    border-radius: 14px;
    font-weight: 900;
    font-size: 1.5rem;
    letter-spacing: 0.08em;
    border: 3px solid currentColor;
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(10px);
  }
  .swipeDecision.like {
    right: 1.4rem;
    color: #38f29a;
    transform: rotate(8deg);
  }
  .swipeDecision.nope {
    left: 1.4rem;
    color: #ff5d7b;
    transform: rotate(-8deg);
  }
  .discoverReasonPanel {
    border-radius: 22px;
    padding: 1rem 1.1rem;
    background: rgba(255, 247, 241, 0.96);
    border: 1px solid rgba(228, 204, 184, 0.95);
  }
  .discoverReasonPanel strong {
    display: block;
    margin-bottom: 0.6rem;
  }
  .discoverReasonPanel .list {
    margin: 0;
  }
  .discoverActionBar {
    display: flex;
    gap: 0.7rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .swipeActionButton {
    min-width: 110px;
    min-height: 52px;
    border-radius: 999px;
    font-weight: 800;
  }
  .swipeArrowButton {
    min-width: 64px;
    width: 64px;
    height: 64px;
    padding: 0;
    position: relative;
    z-index: 3;
    pointer-events: auto;
    touch-action: manipulation;
    font-size: 1.7rem;
    line-height: 1;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.18);
  }
  .swipeArrowButtonLike {
    background: linear-gradient(135deg, #19b45b, #4ee184);
    color: white;
  }
  .swipeActionButton.primary {
    background: #17191f;
    color: white;
  }
  .matchGallery {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
  .matchCard {
    display: grid;
    gap: 0.85rem;
    padding: 0.9rem;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(228, 204, 184, 0.95);
    box-shadow: 0 24px 60px rgba(125, 75, 31, 0.08);
  }
  .matchThumb {
    min-height: 240px;
    border-radius: 18px;
    overflow: hidden;
    background: linear-gradient(135deg, #ffd7c0, #ffece0);
  }
  .matchThumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .matchBody {
    display: grid;
    gap: 0.45rem;
  }
  .matchBody .actionsRow {
    margin-top: 0.35rem;
  }
  .matchBody h3, .likesColumn h3 {
    margin: 0;
  }
  .matchBody p {
    margin: 0;
    color: #4d372a;
  }
  .sectionHeader {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  .likesColumn {
    display: grid;
    gap: 1.2rem;
    align-content: start;
  }
  .photoPanel {
    min-height: 280px;
    border-radius: 20px;
    overflow: hidden;
    background: linear-gradient(135deg, #ffd7c0, #ffece0);
  }
  .photoPanel img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .photoFallback {
    display: grid;
    place-items: center;
    height: 280px;
    font-size: 4rem;
    font-weight: 800;
    color: #a24b23;
  }
  .scoreRow { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .score, .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.45rem 0.75rem;
    border-radius: 999px;
    font-weight: 800;
  }
  .score { background: #1f1f1f; color: white; }
  .badge { background: #ffe7d8; color: #a14c24; }
  .listItem {
    display: grid;
    gap: 0.25rem;
    border-radius: 18px;
    padding: 0.9rem 1rem;
  }
  .likedProfileItem {
    background: rgba(255, 248, 233, 0.85);
    border: 1px solid rgba(236, 211, 190, 0.95);
  }
  .listItem.spread {
    grid-template-columns: 1fr auto;
    align-items: center;
  }
  .chatListLink {
    display: grid;
    gap: 0.25rem;
    color: inherit;
    text-decoration: none;
  }
  .inboxShell, .dmShell {
    display: grid;
    gap: 1rem;
  }
  .inboxCard, .inboxSuggestionsCard, .dmCard {
    border-radius: 32px;
  }
  .inboxHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .inboxHeader h2, .dmHeader h2 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3.1rem);
    letter-spacing: -0.06em;
  }
  .requestsButton {
    border: none;
    background: transparent;
    color: #8f98a9;
    font-size: 1.1rem;
    font-weight: 800;
    padding: 0;
  }
  .inboxList {
    display: grid;
  }
  .inboxRow {
    width: 100%;
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr) auto;
    gap: 1rem;
    align-items: center;
    padding: 1rem 0;
    border: none;
    background: transparent;
    border-bottom: 1px solid rgba(225, 229, 236, 0.9);
    text-align: left;
  }
  .inboxRow:last-child {
    border-bottom: none;
  }
  .inboxAvatar, .dmAvatar, .inboxMiniAvatar {
    border-radius: 50%;
    overflow: hidden;
    background: linear-gradient(135deg, #ffd7c0, #ffece0);
    flex-shrink: 0;
  }
  .inboxAvatar {
    width: 74px;
    height: 74px;
  }
  .dmAvatar, .inboxMiniAvatar {
    width: 56px;
    height: 56px;
  }
  .inboxAvatar img, .dmAvatar img, .inboxMiniAvatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .inboxMeta {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
  }
  .inboxNameRow, .inboxPreviewRow, .inboxActions, .dmHeader, .dmProfileBlock {
    display: flex;
    align-items: center;
  }
  .inboxNameRow {
    gap: 0.55rem;
    color: #1f2230;
  }
  .inboxNameRow strong {
    display: block;
    font-size: 1.1rem;
    font-weight: 800;
    color: #1f2230;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
  }
  .miniBadge {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: #fff0d9;
    color: #a06017;
    font-size: 0.72rem;
    font-weight: 800;
  }
  .inboxPreviewRow {
    gap: 0.55rem;
    min-width: 0;
    color: #7f8796;
  }
  .inboxPreview {
    min-width: 0;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.98rem;
  }
  .inboxPreview.unread {
    color: #23252d;
    font-weight: 700;
  }
  .inboxTime {
    flex-shrink: 0;
    color: #8f98a9;
    font-size: 0.96rem;
  }
  .inboxActions {
    gap: 0.8rem;
    justify-content: flex-end;
  }
  .unreadDot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #4f67ff;
    box-shadow: 0 0 0 6px rgba(79, 103, 255, 0.1);
  }
  .cameraButton {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: transparent;
    border: 2px solid #9ea6b4;
    color: #434853;
    font-size: 1.5rem;
    padding: 0;
  }
  .cameraButton span {
    transform: translateY(-1px);
  }
  .inboxSuggestionRow {
    display: grid;
    gap: 0.9rem;
    padding: 1rem 0;
    border-bottom: 1px solid rgba(225, 229, 236, 0.9);
  }
  .inboxSuggestionRow:last-child {
    border-bottom: none;
  }
  .inboxSuggestionProfile {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.9rem;
    align-items: center;
  }
  .inboxSuggestionCopy {
    display: grid;
    gap: 0.22rem;
  }
  .inboxSuggestionCopy strong {
    font-size: 1rem;
  }
  .inboxSuggestionCopy span {
    color: #6f7785;
  }
  .dmCard {
    padding: 1rem;
    display: grid;
    gap: 1rem;
  }
  .dmHeader {
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid rgba(225, 229, 236, 0.9);
  }
  .dmProfileBlock {
    gap: 0.8rem;
  }
  .dmBackLink {
    color: #333843;
    text-decoration: none;
    font-size: 1.2rem;
    font-weight: 800;
  }
  .dmQuickActions {
    display: flex;
    gap: 0.65rem;
    overflow-x: auto;
    padding-bottom: 0.3rem;
  }
  .dmMessages {
    min-height: 420px;
    max-height: 62vh;
    overflow: auto;
    display: grid;
    gap: 0.8rem;
    padding: 0.35rem 0.1rem;
  }
  .dmRow {
    display: grid;
    gap: 0.3rem;
  }
  .dmRow.own {
    justify-items: end;
  }
  .dmRow.other {
    justify-items: start;
  }
  .dmRow.muted {
    opacity: 0.7;
  }
  .dmBubble {
    max-width: min(78%, 520px);
    display: grid;
    gap: 0.28rem;
    border-radius: 24px;
    padding: 0.95rem 1rem;
    background: #eef1f6;
    color: #1f2430;
  }
  .dmBubble.pressable {
    cursor: pointer;
  }
  .dmRow.own .dmBubble {
    background: linear-gradient(135deg, #1a1d25, #3a4154);
    color: white;
    border-bottom-right-radius: 10px;
  }
  .dmRow.other .dmBubble {
    border-bottom-left-radius: 10px;
  }
  .dmBubble strong {
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.78;
  }
  .dmBubble small {
    opacity: 0.72;
  }
  .dmMediaLink {
    color: inherit;
    font-weight: 700;
  }
  .dmDeleteSheet {
    position: fixed;
    inset: 0;
    background: rgba(20, 24, 35, 0.42);
    display: grid;
    place-items: end center;
    padding: 1rem;
    z-index: 40;
  }
  .dmDeleteSheetCard {
    width: min(100%, 420px);
    display: grid;
    gap: 0.75rem;
    background: #fffaf6;
    border: 1px solid rgba(227, 192, 158, 0.55);
    border-radius: 24px;
    padding: 1rem;
    box-shadow: 0 20px 48px rgba(20, 24, 35, 0.18);
  }
  .dmDeleteSheetCard h3 {
    margin: 0;
  }
  .dmDeleteMenuCard {
    width: min(100%, 320px);
    display: grid;
    gap: 0.65rem;
    background: #151515;
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 24px;
    padding: 0.85rem;
    box-shadow: 0 20px 48px rgba(20, 24, 35, 0.3);
  }
  .dmDeleteMenuCard button {
    width: 100%;
    justify-content: flex-start;
    color: inherit;
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.04);
  }
  .dmDeleteSheetCard button {
    width: 100%;
    justify-content: center;
  }
  .dmDeleteButton {
    font-size: 0.8rem;
  }
  .dmComposer {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.7rem;
    align-items: center;
    padding-top: 0.3rem;
  }
  .dmComposer input {
    min-height: 54px;
    border-radius: 999px;
    border: 1px solid #d7dce6;
    background: #f6f8fb;
    padding: 0 1rem;
  }
  .chatBox {
    display: grid;
    gap: 0.7rem;
    max-height: 520px;
    overflow: auto;
  }
  .message {
    border-radius: 18px;
    padding: 0.9rem 1rem;
    display: grid;
    gap: 0.35rem;
  }
  .message.muted { opacity: 0.7; }
  .inlineForm {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.75rem;
    margin-top: 1rem;
  }
  .toggle {
    display: flex;
    gap: 0.7rem;
    align-items: center;
  }
  .metric {
    font-size: 2.4rem;
    font-weight: 800;
    margin: 0.25rem 0 0;
  }
  .onboardingShell {
    min-height: 100vh;
    display: grid;
    place-items: stretch;
    padding: 0;
    background:
      radial-gradient(circle at top left, rgba(255, 93, 133, 0.18), transparent 28%),
      radial-gradient(circle at top right, rgba(255, 150, 88, 0.18), transparent 24%),
      linear-gradient(180deg, #ffffff 0%, #fffaf7 100%);
  }
  .onboardingPhone {
    width: 100%;
    min-height: 100vh;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 0;
    border: none;
    box-shadow: none;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    overflow: hidden;
  }
  .onboardingProgressTrack {
    height: 6px;
    background: #edf0f5;
  }
  .onboardingProgressFill {
    height: 100%;
    background: linear-gradient(90deg, #ff5f8f, #df45ff);
    transition: width 220ms ease;
  }
  .onboardingHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: min(100%, 1120px);
    margin: 0 auto;
    padding: 1.25rem clamp(1.25rem, 4vw, 3rem) 0;
  }
  .iconButton {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: #8a90a5;
    font-size: 2rem;
    padding: 0;
  }
  .skipLabel {
    color: #9399ac;
    font-weight: 700;
  }
  .skipButton {
    border: none;
    background: transparent;
    color: #9399ac;
    font-weight: 700;
    padding: 0;
  }
  .onboardingBody {
    width: min(100%, 1120px);
    margin: 0 auto;
    padding: 0 clamp(1.25rem, 4vw, 3rem) 1.5rem;
    overflow: auto;
    display: grid;
    align-content: start;
    gap: 1.5rem;
  }
  .onboardingIntro,
  .onboardingRules,
  .onboardingFormSection,
  .notice {
    max-width: 760px;
  }
  .onboardingIntro h1 {
    font-size: clamp(2.7rem, 6vw, 5.4rem);
    line-height: 0.98;
    margin: 1.25rem 0 0.75rem;
    letter-spacing: -0.06em;
  }
  .onboardingIntro p {
    margin: 0;
    color: #5f6473;
    font-size: 1.1rem;
    line-height: 1.45;
  }
  .onboardingFooter {
    width: min(100%, 1120px);
    margin: 0 auto;
    padding: 1rem clamp(1.25rem, 4vw, 3rem) 2rem;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.95) 35%);
    display: flex;
    justify-content: center;
  }
  .primaryCta {
    width: min(100%, 420px);
    min-height: 58px;
    border-radius: 999px;
    background: #111111;
    color: white;
    font-size: 1.5rem;
  }
  .onboardingRules {
    display: grid;
    gap: 1.35rem;
  }
  .logoDot {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: linear-gradient(180deg, #ff5864, #ff7d57);
  }
  .ruleBlock {
    display: grid;
    gap: 0.3rem;
  }
  .ruleBlock strong {
    font-size: 1.35rem;
  }
  .ruleBlock p {
    margin: 0;
    color: #5f6473;
    line-height: 1.55;
    font-size: 1.12rem;
  }
  .onboardingFormSection {
    display: grid;
    gap: 1rem;
  }
  .onboardingInput {
    width: 100%;
    border: none;
    border-bottom: 2px solid #cfd4df;
    border-radius: 0;
    padding: 0.85rem 0;
    background: transparent;
    font-size: 1.25rem;
    color: #1a1e29;
  }
  .onboardingInput:focus {
    outline: none;
    border-bottom-color: #ff4c89;
  }
  .onboardingTextarea {
    min-height: 110px;
    resize: vertical;
  }
  .onboardingSelect {
    width: 100%;
    border: 1px solid #dfe3ed;
    border-radius: 16px;
    padding: 1rem;
    background: white;
    color: #1a1e29;
  }
  .optionStack, .stackedSections {
    display: grid;
    gap: 1rem;
  }
  .optionGrid {
    display: grid;
    gap: 0.9rem;
  }
  .selectCard, .goalCard {
    width: 100%;
    border: 2px solid #dfe3ed;
    background: white;
    color: #1f2230;
    border-radius: 18px;
    padding: 1.15rem 1.1rem;
    text-align: left;
    font-size: 1.1rem;
    font-weight: 700;
  }
  .selectCard.selected, .goalCard.selected {
    border-color: #ff4c89;
    box-shadow: 0 12px 30px rgba(255, 76, 137, 0.14);
  }
  .goalCard {
    min-height: 148px;
    display: grid;
    place-items: center;
    gap: 0.8rem;
    text-align: center;
  }
  .goalEmoji {
    font-size: 2.15rem;
  }
  .onboardingToggle {
    color: #4f5566;
    justify-content: center;
  }
  .distanceHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 1.1rem;
    font-weight: 700;
  }
  .distanceSlider {
    padding: 0;
    border: none;
    accent-color: #ff4c89;
  }
  .tagSection {
    display: grid;
    gap: 0.8rem;
    padding: 0 0 1rem;
    border-bottom: 1px solid #eceef3;
  }
  .tagSection h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  .tagGrid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
  }
  .tagButton {
    border: 1.5px solid #dfe3ed;
    background: white;
    color: #4c5364;
    border-radius: 999px;
    padding: 0.8rem 1rem;
    font-weight: 500;
  }
  .tagButton.selected {
    border-color: #ff4c89;
    color: #1f2230;
    background: #fff7fb;
  }
  .photoSlots {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.9rem;
  }
  .photoSlot {
    aspect-ratio: 0.78;
    border-radius: 20px;
    border: 2px dashed #9fa6b7;
    background: #f7f8fb;
    color: #ff4c89;
    font-size: 2.2rem;
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: 0;
  }
  .photoSlot.active {
    border-color: #ff4c89;
    background: #fff8fb;
  }
  .photoSlot.filled {
    border-style: solid;
  }
  .photoSlot img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .hiddenFileInput {
    display: none;
  }
  .photoActionRow {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .photoPickerButton {
    min-width: 220px;
  }
  .dashedInfoCard {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    border: 2px dashed #8d93a6;
    border-radius: 24px;
    background: #f5f6fa;
    color: #1a1e29;
    padding: 1.35rem 1.25rem;
    text-align: left;
  }
  .dashedInfoCard strong {
    display: block;
    font-size: 1.15rem;
    margin-bottom: 0.35rem;
  }
  .dashedInfoCard p {
    margin: 0;
    color: #5f6473;
    line-height: 1.45;
  }
  .plusBadge {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: #000;
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 2rem;
    flex-shrink: 0;
  }
  .tipCard {
    display: flex;
    gap: 0.85rem;
    align-items: center;
    border: 2px solid #2c2f3a;
    border-radius: 24px;
    padding: 1rem 1.1rem;
    background: #fff;
  }
  .tipCard p {
    margin: 0;
    color: #343948;
    line-height: 1.45;
  }
  .tipCard strong {
    color: #ff3e88;
  }
  .tipIcon {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid #d9dde8;
    display: grid;
    place-items: center;
    font-weight: 800;
    flex-shrink: 0;
  }
  .infoCopy {
    display: grid;
    gap: 0.9rem;
    color: #4f5566;
    line-height: 1.55;
  }
  .infoCopy p {
    margin: 0;
  }
  .savedContactChip {
    display: inline-flex;
    align-items: center;
    padding: 0.7rem 0.95rem;
    border-radius: 999px;
    background: #fff7fb;
    border: 1.5px solid #ffb7d2;
    color: #4f5566;
    font-weight: 600;
  }
  @media (max-width: 900px) {
    .twoCol, .threeCol, .matchesLayout, .discoverLayout { grid-template-columns: 1fr; }
    .topbar, .heroCard, .listItem.spread { display: grid; }
    .matchGallery { grid-template-columns: 1fr; }
    .inlineForm { grid-template-columns: 1fr; }
    .swipeStage {
      min-height: 72vh;
    }
    .inboxRow {
      grid-template-columns: 72px minmax(0, 1fr) auto;
    }
    .dmComposer {
      grid-template-columns: 1fr;
    }
    .interestsHeader {
      grid-template-columns: 1fr;
      display: grid;
    }
    .shell {
      width: min(100%, calc(100% - 1rem));
    }
  }
  @media (max-width: 520px) {
    .discoverControlsCard, .discoverDeckCard {
      border-radius: 24px;
    }
    .discoverHeader {
      display: grid;
    }
    .swipeStage {
      min-height: 63vh;
    }
    .swipeCard {
      border-radius: 26px;
    }
    .swipeCardContent {
      padding: 1rem;
    }
    .swipeActionButton {
      min-width: 98px;
      min-height: 48px;
      font-size: 0.95rem;
    }
    .swipeArrowButton {
      min-width: 56px;
      width: 56px;
      height: 56px;
      font-size: 1.45rem;
    }
    .inboxCard, .inboxSuggestionsCard, .dmCard {
      border-radius: 24px;
      padding: 1rem;
    }
    .inboxHeader h2, .dmHeader h2 {
      font-size: 1.9rem;
    }
    .inboxRow {
      grid-template-columns: 64px minmax(0, 1fr) auto;
      gap: 0.8rem;
    }
    .inboxAvatar {
      width: 60px;
      height: 60px;
    }
    .cameraButton {
      width: 46px;
      height: 46px;
      font-size: 1.3rem;
    }
    .dmMessages {
      max-height: 56vh;
    }
    .dmBubble {
      max-width: 88%;
    }
    .onboardingShell {
      padding: 0;
    }
    .onboardingPhone {
      width: 100%;
      min-height: 100vh;
      border-radius: 0;
      border: none;
      box-shadow: none;
    }
    .onboardingHeader,
    .onboardingBody,
    .onboardingFooter {
      width: 100%;
    }
    .onboardingIntro,
    .onboardingRules,
    .onboardingFormSection,
    .notice,
    .primaryCta {
      max-width: none;
      width: 100%;
    }
  }
`;
