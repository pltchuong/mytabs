const firebaseConfig = {
  apiKey: "AIzaSyA1SgvVMd43W8uA5sgc_5gZ7oqBFSFW3nk",
  authDomain: "phan-mytabs.firebaseapp.com",
  projectId: "phan-mytabs",
  storageBucket: "phan-mytabs.firebasestorage.app",
  messagingSenderId: "881249902567",
  appId: "1:881249902567:web:a926dcf9aaf9b15e932742"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_MAP = { 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B' };
const SECTION_REGEX = /^\[([A-Za-z0-9 ]+)\]$/;
const STORAGE_KEY = 'mytabs:data';
const DEFAULT_PROFILE = 'Default';

let songs = [];
let currentSong = null;
let currentProfile = null;
let transposeOffset = 0;
let capoPosition = 0;
let fontSize = 16;
let scrollSpeed = 0;
let scrollInterval = null;
let scrolling = false;
let scrollAccumulator = 0;

function getData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);
  return { profiles: { [DEFAULT_PROFILE]: {} }, activeProfile: DEFAULT_PROFILE, stats: {}, fontSize: 16 };
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  if (auth && auth.currentUser) {
    db.collection('users').doc(auth.currentUser.uid).set(data);
  }
}

function getProfiles() {
  return Object.keys(getData().profiles).sort();
}

function getActiveProfile() {
  const data = getData();
  const profiles = Object.keys(data.profiles);
  if (data.activeProfile && profiles.includes(data.activeProfile)) return data.activeProfile;
  return profiles[0] || DEFAULT_PROFILE;
}

function savePrefs() {
  if (!currentSong) return;
  const data = getData();
  if (!data.profiles[currentProfile]) data.profiles[currentProfile] = {};
  data.profiles[currentProfile][currentSong.id] = { transposeOffset, capoPosition, fontSize, scrollSpeed };
  saveData(data);
}

function loadPrefs(profileId, songId) {
  const data = getData();
  const prefs = data.profiles[profileId] && data.profiles[profileId][songId];
  if (prefs) {
    transposeOffset = prefs.transposeOffset || 0;
    capoPosition = prefs.capoPosition || 0;
    fontSize = prefs.fontSize || 16;
    scrollSpeed = prefs.scrollSpeed || 1;
  } else {
    transposeOffset = 0;
    capoPosition = 0;
    fontSize = 16;
    scrollSpeed = 0;
  }
}

function addProfile() {
  const name = prompt('Profile name:');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  const data = getData();
  if (data.profiles[trimmed]) return;
  data.profiles[trimmed] = {};
  saveData(data);
  renderProfileBar();
}

function renameProfile(oldName) {
  const newName = prompt('Rename profile:', oldName);
  if (!newName || !newName.trim() || newName.trim() === oldName) return;
  const trimmed = newName.trim();
  const data = getData();
  if (data.profiles[trimmed]) return;
  data.profiles[trimmed] = data.profiles[oldName];
  delete data.profiles[oldName];
  if (data.activeProfile === oldName) data.activeProfile = trimmed;
  saveData(data);
  if (currentProfile === oldName) currentProfile = trimmed;
  renderProfileBar();
}

function switchProfile(profile) {
  currentProfile = profile;
  const data = getData();
  data.activeProfile = profile;
  saveData(data);
  document.querySelectorAll('.profile-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.profile === profile);
  });
  if (currentSong) {
    loadPrefs(currentProfile, currentSong.id);
    renderSong();
  }
}

function renderProfileBar() {
  const profiles = getProfiles();
  const bar = document.getElementById('profile-bar');
  bar.innerHTML = profiles.map(p => {
    return `<button class="profile-btn ${p === currentProfile ? 'active' : ''}" data-profile="${p}">${p}</button>`;
  }).join('') + `<button class="profile-btn profile-add-btn" onclick="addProfile()">+</button>`;

  bar.querySelectorAll('.profile-btn:not(.profile-add-btn)').forEach(btn => {
    let holdTimer = null;
    const name = btn.dataset.profile;

    btn.addEventListener('click', () => {
      if (!holdTimer) return;
      clearTimeout(holdTimer);
      holdTimer = null;
      switchProfile(name);
    });

    btn.addEventListener('pointerdown', () => {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        renameProfile(name);
      }, 500);
    });

    btn.addEventListener('pointercancel', () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    });

    btn.addEventListener('contextmenu', e => e.preventDefault());
  });
}

function trackOpen(songId) {
  const data = getData();
  if (!data.stats) data.stats = {};
  data.stats[songId] = (data.stats[songId] || 0) + 1;
  saveData(data);
}

function loadFromFirebase() {
  if (!auth || !auth.currentUser) return Promise.resolve();
  const uid = auth.currentUser.uid;
  return db.collection('users').doc(uid).get().then(doc => {
    if (doc.exists) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc.data()));
      currentProfile = getActiveProfile();
    }
  });
}

async function loadSongs() {
  songs = await fetch('songs.json').then(r => r.json());
  renderSongList();
  handleRoute();
}

function renderSongList() {
  const query = document.getElementById('search').value.toLowerCase();
  const list = document.getElementById('song-list');
  const stats = getData().stats || {};
  const filtered = songs.filter(s =>
    s.title.toLowerCase().includes(query) ||
    s.artist.toLowerCase().includes(query)
  ).sort((a, b) => (stats[b.id] || 0) - (stats[a.id] || 0));
  list.innerHTML = filtered.map(s => `
    <li onclick="openSong('${s.id}')">
      <div class="song-title">${s.title}</div>
      <div class="song-artist">${s.artist}</div>
    </li>
  `).join('');
}

function openSong(id) {
  location.hash = id;
}

function closeSong() {
  location.hash = '';
}

function showSong(id) {
  currentSong = songs.find(s => s.id === id);
  trackOpen(id);
  loadPrefs(currentProfile, id);
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('song-view').classList.add('active');
  renderProfileBar();
  renderSong();
}

function showList() {
  currentSong = null;
  stopScroll();
  document.getElementById('list-view').style.display = 'block';
  document.getElementById('song-view').classList.remove('active');
}

function handleRoute() {
  const id = location.hash.slice(1);
  if (id && songs.find(s => s.id === id)) {
    showSong(id);
  } else {
    showList();
  }
}

function transposeChord(chord, semitones) {
  if (!chord || chord.trim() === '') return chord;

  let root = chord[0];
  let rest = chord.slice(1);

  if (rest.startsWith('#') || rest.startsWith('b')) {
    root += rest[0];
    rest = rest.slice(1);
  }

  if (FLAT_MAP[root]) root = FLAT_MAP[root];

  const idx = NOTES.indexOf(root);
  if (idx === -1) return chord;

  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return NOTES[newIdx] + rest;
}

function renderLine(line, semitones) {
  return line.replace(/\[([^\]]+)\]/g, (_, chord) => {
    const transposed = transposeChord(chord, semitones);
    return `<span class="chord">[${transposed}]</span>`;
  });
}

function renderSong() {
  if (!currentSong) return;

  const semitones = transposeOffset;

  document.getElementById('song-title').textContent = currentSong.title;
  document.getElementById('song-artist').textContent = currentSong.artist;

  const currentKey = transposeChord(currentSong.originalKey, semitones);
  const offsetLabel = transposeOffset === 0 ? '' : transposeOffset > 0 ? `(+${transposeOffset})` : ` (${transposeOffset})`;
  document.getElementById('current-key').textContent = currentKey + offsetLabel;
  document.getElementById('current-capo').textContent = capoPosition;
  document.getElementById('current-size').textContent = fontSize;
  document.getElementById('scroll-speed').value = scrollSpeed;

  const sectionsEl = document.getElementById('sections');
  sectionsEl.style.fontSize = fontSize + 'px';
  sectionsEl.style.lineHeight = (1.4 + (16 - fontSize) * 0.02).toFixed(2);
  sectionsEl.innerHTML = currentSong.content.map(line => {
    if (line === '') return '<div class="chord-line-break"></div>';
    const sectionMatch = line.match(SECTION_REGEX);
    if (sectionMatch) return `<div class="section-name">${sectionMatch[1]}</div>`;
    return `<div class="chord-line">${renderLine(line, semitones)}</div>`;
  }).join('');
}

function transpose(direction) {
  transposeOffset = ((transposeOffset + direction) % 12 + 12) % 12;
  savePrefs();
  renderSong();
}

function adjustCapo(direction) {
  capoPosition = Math.max(0, Math.min(12, capoPosition + direction));
  savePrefs();
  renderSong();
}

function adjustSize(direction) {
  fontSize = Math.max(10, Math.min(28, fontSize + direction));
  document.getElementById('current-size').textContent = fontSize;
  const sectionsEl = document.getElementById('sections');
  sectionsEl.style.fontSize = fontSize + 'px';
  sectionsEl.style.lineHeight = (1.4 + (16 - fontSize) * 0.02).toFixed(2);
  savePrefs();
}

function setScrollSpeed(value) {
  scrollSpeed = parseInt(value);
  savePrefs();
  stopScroll();
  startScroll();
}

function startScroll() {
  if (scrollSpeed === 0 || scrollInterval) return;
  scrolling = true;
  scrollInterval = setInterval(() => {
    window.scrollBy(0, 1);
  }, Math.round(500 / scrollSpeed));
}

function stopScroll() {
  scrolling = false;
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
}

function signIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
}

function signOut() {
  auth.signOut();
}

auth.onAuthStateChanged(user => {
  const signInBtn = document.getElementById('sign-in-btn');
  const signOutBtn = document.getElementById('sign-out-btn');
  if (user) {
    signInBtn.style.display = 'none';
    signOutBtn.style.display = 'inline-block';
    signOutBtn.textContent = user.displayName;
    loadFromFirebase().then(() => {
      renderSongList();
      if (currentSong) {
        loadPrefs(currentProfile, currentSong.id);
        renderProfileBar();
        renderSong();
      }
    });
  } else {
    signInBtn.style.display = 'inline-block';
    signOutBtn.style.display = 'none';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  currentProfile = getActiveProfile();
  loadSongs();
  document.getElementById('search').addEventListener('input', renderSongList);
  window.addEventListener('hashchange', handleRoute);
});
