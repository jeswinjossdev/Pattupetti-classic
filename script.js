// YouTube API Configuration - Fixed with proper API integration
const YOUTUBE_API_KEY = ''; // Replace with your actual API key
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Global variables
let currentSong = null;
let isPlaying = false;
let currentIndex = 0;
let isShuffle = false;
let isRepeat = false;
let isMuted = false;
let previousVolume = 50;
let currentPlaylist = [];
let likedSongs = [];
let recentlyPlayed = [];
let savedSongs = [];
let userPlaylists = [];
let isPlayerMinimized = false;
let currentPlaylistId = null;
let currentProgress = 0;
let songDuration = 0;
let progressInterval = null;
let currentQueue = [];
let addToPlaylistSongId = null;
let searchTimeout = null;
let sidebarVisible = false;

// Audio player element
const audioPlayer = document.getElementById('audioPlayer');

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    loadStoredData();
    loadFeaturedMusic();
    setupKeyboardShortcuts();
    autoDetectBrowserInfo();
});

function initializeApp() {
    setupAudioPlayer();
    updateUserPlaylistsList();
    updateUIElements();
    showWelcomeMessage();
}

function setupEventListeners() {
    // Search functionality with improved debouncing
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch();
        }
    });
    
    document.getElementById('searchBtn').addEventListener('click', performSearch);

    // Create playlist form
    document.getElementById('createPlaylistForm').addEventListener('submit', handleCreatePlaylist);
    
    // Bug report form
    document.getElementById('bugReportForm').addEventListener('submit', handleBugReport);
    
    // Mobile overlay click
    document.getElementById('mobileOverlay').addEventListener('click', closeSidebar);
    
    // Click outside modals to close
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal-overlay')) {
            closeAllModals();
        }
    });

    // Sidebar visibility management
    document.addEventListener('click', function(e) {
        const sidebar = document.getElementById('sidebar');
        const navBtn = document.querySelector('.nav-btn');
        
        if (!sidebar.contains(e.target) && !navBtn.contains(e.target) && sidebar.classList.contains('show')) {
            closeSidebar();
        }
    });
}

function setupAudioPlayer() {
    audioPlayer.addEventListener('loadedmetadata', updateDuration);
    audioPlayer.addEventListener('ended', handleSongEnd);
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('loadstart', () => showLoading(true));
    audioPlayer.addEventListener('canplay', () => showLoading(false));
    audioPlayer.addEventListener('error', handleAudioError);
    audioPlayer.volume = 0.5;
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Only handle shortcuts when not typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch(e.code) {
            case 'Space':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'ArrowRight':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    nextTrack();
                }
                break;
            case 'ArrowLeft':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    previousTrack();
                }
                break;
            case 'KeyS':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    toggleShuffle();
                }
                break;
            case 'KeyR':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    toggleRepeat();
                }
                break;
        }
    });
}

function handleAudioError(event) {
    console.error('Audio error:', event);
    showError('Audio playback failed. YouTube audio streaming requires server-side processing due to CORS restrictions. Currently running in demo mode.');
    showLoading(false);
    // Fall back to demo mode
    simulatePlayback();
}

// Enhanced YouTube API Functions with better error handling
async function searchYouTube(query, maxResults = 20) {
    try {
        showLoading(true);
        
        // Check if API key is properly configured
        if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_API_KEY_HERE') {
            throw new Error('YouTube API key not configured. Please add your API key to enable real search functionality.');
        }
        
        const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&type=video&videoCategoryId=10&maxResults=${maxResults}&q=${encodeURIComponent(query + ' music')}&key=${YOUTUBE_API_KEY}`;
        
        const response = await fetch(searchUrl);
        
        if (!response.ok) {
            if (response.status === 403) {
                const errorData = await response.json();
                if (errorData.error.errors[0].reason === 'quotaExceeded') {
                    throw new Error('YouTube API quota exceeded. Please try again tomorrow or contact support.');
                } else {
                    throw new Error('API access forbidden. Please check your API key and permissions.');
                }
            } else if (response.status === 400) {
                throw new Error('Invalid search query. Please try different keywords.');
            } else {
                throw new Error(`API error: ${response.status}. Please try again later.`);
            }
        }
        
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
            return [];
        }
        
        // Get video details for duration
        const videoIds = data.items.map(item => item.id.videoId).join(',');
        const detailsUrl = `${YOUTUBE_API_BASE}/videos?part=contentDetails,statistics&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
        
        let videoDetails = {};
        try {
            const detailsResponse = await fetch(detailsUrl);
            if (detailsResponse.ok) {
                const detailsData = await detailsResponse.json();
                detailsData.items.forEach(item => {
                    videoDetails[item.id] = {
                        duration: parseDuration(item.contentDetails.duration),
                        viewCount: item.statistics.viewCount
                    };
                });
            }
        } catch (error) {
            console.warn('Could not fetch video details:', error);
        }
        
        return data.items.map(item => formatYouTubeVideo(item, videoDetails[item.id.videoId]));
    } catch (error) {
        console.error('YouTube API error:', error);
        showError(error.message || 'Failed to search YouTube. Showing demo content.');
        return getDemoSearchResults(query);
    } finally {
        showLoading(false);
    }
}

async function getTrendingMusic() {
    try {
        showLoading(true);
        
        if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_API_KEY_HERE') {
            return getDemoTrendingData();
        }
        
        const response = await fetch(
            `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails,statistics&chart=mostPopular&videoCategoryId=10&maxResults=20&regionCode=US&key=${YOUTUBE_API_KEY}`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.items.map(item => formatYouTubeVideo(item, {
            duration: parseDuration(item.contentDetails.duration),
            viewCount: item.statistics.viewCount
        }));
    } catch (error) {
        console.error('YouTube API error:', error);
        showError('Failed to load trending music. Showing demo content.');
        return getDemoTrendingData();
    } finally {
        showLoading(false);
    }
}

function getDemoSearchResults(query) {
    const demoResults = [
        {
            id: `demo-search-${Date.now()}-1`,
            title: `${query} - Popular Song 1`,
            artist: 'Demo Artist 1',
            album: 'YouTube',
            thumbnail: null,
            duration: '3:45',
            liked: false,
            saved: false,
            youtubeUrl: '#',
            publishedAt: new Date().toISOString()
        },
        {
            id: `demo-search-${Date.now()}-2`,
            title: `${query} - Hit Song 2`,
            artist: 'Demo Artist 2',
            album: 'YouTube',
            thumbnail: null,
            duration: '4:12',
            liked: false,
            saved: false,
            youtubeUrl: '#',
            publishedAt: new Date().toISOString()
        },
        {
            id: `demo-search-${Date.now()}-3`,
            title: `Best of ${query}`,
            artist: 'Various Artists',
            album: 'YouTube',
            thumbnail: null,
            duration: '3:28',
            liked: false,
            saved: false,
            youtubeUrl: '#',
            publishedAt: new Date().toISOString()
        }
    ];
    
    return demoResults;
}

function getDemoTrendingData() {
    return [
        {
            id: 'demo-trending-1',
            title: 'Trending Hit 2025',
            artist: 'Popular Artist',
            album: 'YouTube',
            thumbnail: null,
            duration: '3:45',
            liked: false,
            saved: false,
            youtubeUrl: '#'
        },
        {
            id: 'demo-trending-2',
            title: 'Viral Song of the Week',
            artist: 'Trending Artist',
            album: 'YouTube',
            thumbnail: null,
            duration: '4:12',
            liked: false,
            saved: false,
            youtubeUrl: '#'
        },
        {
            id: 'demo-trending-3',
            title: 'Chart Topper #1',
            artist: 'Billboard Artist',
            album: 'YouTube',
            thumbnail: null,
            duration: '3:28',
            liked: false,
            saved: false,
            youtubeUrl: '#'
        }
    ];
}

function parseDuration(duration) {
    // Parse ISO 8601 duration (PT4M13S) to readable format
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');
    
    if (hours) {
        return `${hours}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
    } else {
        return `${minutes || '0'}:${seconds.padStart(2, '0')}`;
    }
}

function formatYouTubeVideo(item, details) {
    const snippet = item.snippet;
    const videoId = item.id.videoId || item.id;
    
    // Extract artist and title from video title
    const title = snippet.title;
    let artist = snippet.channelTitle;
    let songTitle = title;
    
    // Try to extract artist - title format
    if (title.includes(' - ')) {
        const parts = title.split(' - ');
        if (parts.length >= 2) {
            artist = parts[0].trim();
            songTitle = parts.slice(1).join(' - ').trim();
        }
    } else if (title.includes('|')) {
        const parts = title.split('|');
        if (parts.length >= 2) {
            artist = parts[0].trim();
            songTitle = parts[1].trim();
        }
    }
    
    // Clean up common suffixes
    songTitle = songTitle.replace(/\s*\(Official.*\)/i, '')
                      .replace(/\s*\[Official.*\]/i, '')
                      .replace(/\s*- Official.*/i, '')
                      .trim();
    
    return {
        id: videoId,
        title: songTitle,
        artist: artist,
        album: 'YouTube',
        thumbnail: snippet.thumbnails.medium?.url || snippet.thumbnails.default?.url,
        duration: details?.duration || '0:00',
        liked: isLiked(videoId),
        saved: isSaved(videoId),
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: snippet.publishedAt
    };
}

// Enhanced search functionality
function handleSearchInput(event) {
    const query = event.target.value.trim();
    
    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Show search results page immediately if there's a query
    if (query.length > 0) {
        showPage('search-results');
        document.getElementById('searchInfo').style.display = 'none';
        document.getElementById('searchGrid').innerHTML = '';
        
        // Show loading state
        const loading = document.getElementById('searchLoading');
        if (loading) {
            loading.style.display = 'block';
            loading.textContent = 'Searching...';
        }
    }
    
    // Perform search after user stops typing
    if (query.length > 2) {
        searchTimeout = setTimeout(() => {
            performSearch();
        }, 800);
    } else if (query.length === 0) {
        showPage('home');
    }
}

async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    
    const loading = document.getElementById('searchLoading');
    const searchInfo = document.getElementById('searchInfo');
    const searchQuery = document.getElementById('searchQuery');
    const grid = document.getElementById('searchGrid');
    
    try {
        if (loading) loading.style.display = 'block';
        if (searchInfo) searchInfo.style.display = 'none';
        
        const songs = await searchYouTube(query, 24);
        
        if (loading) loading.style.display = 'none';
        
        // Show search info
        if (searchInfo && searchQuery) {
            searchQuery.textContent = query;
            searchInfo.style.display = 'block';
        }
        
        if (grid) {
            grid.innerHTML = '';
            if (songs.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <h3>No results found</h3>
                        <p>Try searching with different keywords or check your spelling.</p>
                        <button class="btn btn-primary" onclick="searchCategory('popular music 2025')" style="margin-top: 1rem;">
                            Explore Popular Music
                        </button>
                    </div>
                `;
            } else {
                songs.forEach((song, index) => {
                    const card = createMusicCard(song, index, 'search');
                    grid.appendChild(card);
                });
            }
        }
        
        // Ensure we're on the search results page
        showPage('search-results');
        
    } catch (error) {
        console.error('Search error:', error);
        if (loading) loading.style.display = 'none';
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <h3>Search Error</h3>
                    <p>${error.message || 'Something went wrong. Please try again.'}</p>
                    <button class="btn btn-primary" onclick="performSearch()" style="margin-top: 1rem;">
                        Try Again
                    </button>
                </div>
            `;
        }
    }
}

async function searchCategory(category) {
    const query = `${category} latest hits 2025`;
    document.getElementById('searchInput').value = query;
    await performSearch();
}

// Navigation functions with enhanced sidebar management
function showPage(pageId) {
    // Hide player when showing sidebar on mobile
    manageMobilePlayerVisibility();
    
    // Update sidebar active state
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Hide all pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    // Show selected page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // Mark active sidebar item
    const activeItem = event?.currentTarget;
    if (activeItem && activeItem.classList.contains('playlist-item')) {
        activeItem.classList.add('active');
    }
    
    // Load content based on page
    switch(pageId) {
        case 'home':
            loadFeaturedMusic();
            break;
        case 'trending':
            loadTrendingMusic();
            break;
        case 'liked':
            loadLikedSongs();
            break;
        case 'recent':
            loadRecentlyPlayed();
            break;
        case 'saved':
            loadSavedSongs();
            break;
        case 'playlists':
            loadUserPlaylists();
            break;
        case 'support':
            // Support page is static, no loading needed
            break;
    }
    
    // Close sidebar on mobile
    closeSidebar();
}

function showPlaylist(playlistId) {
    const playlist = userPlaylists.find(p => p.id === playlistId);
    if (!playlist) return;
    
    currentPlaylistId = playlistId;
    
    // Update playlist view
    document.getElementById('playlistTitle').textContent = playlist.name;
    document.getElementById('playlistDescription').textContent = playlist.description || 'No description';
    document.getElementById('playlistCount').textContent = `${playlist.songs.length} songs`;
    
    // Load playlist songs
    const playlistSongsGrid = document.getElementById('playlistSongs');
    playlistSongsGrid.innerHTML = '';
    
    if (playlist.songs.length === 0) {
        playlistSongsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎵</div>
                <h3>No songs in this playlist</h3>
                <p>Add some songs to get started!</p>
                <button class="btn btn-primary" onclick="showPage('home')" style="margin-top: 1rem;">
                    Discover Music
                </button>
            </div>
        `;
    } else {
        playlist.songs.forEach((song, index) => {
            const card = createMusicCard(song, index, 'playlist');
            playlistSongsGrid.appendChild(card);
        });
    }
    
    showPage('playlist-view');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    sidebarVisible = !sidebarVisible;
    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
    
    // Manage player visibility on mobile
    manageMobilePlayerVisibility();
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    sidebarVisible = false;
    sidebar.classList.remove('show');
    overlay.classList.remove('show');
    
    // Show player again on mobile
    manageMobilePlayerVisibility();
}

function manageMobilePlayerVisibility() {
    const compactPlayer = document.getElementById('compactPlayer');
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        if (sidebarVisible) {
            compactPlayer.classList.add('hidden');
        } else {
            compactPlayer.classList.remove('hidden');
        }
    } else {
        compactPlayer.classList.remove('hidden');
    }
}

// Content loading functions
async function loadFeaturedMusic() {
    const queries = ['popular music 2025', 'trending songs 2025', 'hit music 2024', 'best songs 2024'];
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];
    const songs = await searchYouTube(randomQuery, 12);
    
    const grid = document.getElementById('featuredGrid');
    if (grid) {
        grid.innerHTML = '';
        if (songs.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎵</div>
                    <h3>Unable to load featured music</h3>
                    <p>Please check your internet connection and try again.</p>
                    <button class="btn btn-primary" onclick="loadFeaturedMusic()" style="margin-top: 1rem;">
                        Retry
                    </button>
                </div>
            `;
        } else {
            songs.forEach((song, index) => {
                const card = createMusicCard(song, index, 'featured');
                grid.appendChild(card);
            });
        }
    }
}

async function loadTrendingMusic() {
    const songs = await getTrendingMusic();
    const grid = document.getElementById('trendingGrid');
    const loading = document.getElementById('trendingLoading');
    
    if (loading) loading.style.display = 'none';
    
    if (grid) {
        grid.innerHTML = '';
        if (songs.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔥</div>
                    <h3>No trending music found</h3>
                    <p>Please try again later or explore other categories.</p>
                    <button class="btn btn-primary" onclick="showPage('home')" style="margin-top: 1rem;">
                        Explore Music
                    </button>
                </div>
            `;
        } else {
            songs.forEach((song, index) => {
                const card = createMusicCard(song, index, 'trending');
                grid.appendChild(card);
            });
        }
    }
}

function loadLikedSongs() {
    const grid = document.getElementById('likedGrid');
    if (grid) {
        grid.innerHTML = '';
        if (likedSongs.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❤️</div>
                    <h3>No liked songs yet</h3>
                    <p>Like some songs to see them here!</p>
                    <button class="btn btn-primary" onclick="showPage('home')" style="margin-top: 1rem;">
                        Discover Music
                    </button>
                </div>
            `;
        } else {
            likedSongs.forEach((song, index) => {
                const card = createMusicCard(song, index, 'liked');
                grid.appendChild(card);
            });
        }
    }
}

function loadRecentlyPlayed() {
    const grid = document.getElementById('recentGrid');
    if (grid) {
        grid.innerHTML = '';
        if (recentlyPlayed.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🕒</div>
                    <h3>No recently played songs</h3>
                    <p>Start playing music to see your history!</p>
                    <button class="btn btn-primary" onclick="showPage('home')" style="margin-top: 1rem;">
                        Start Listening
                    </button>
                </div>
            `;
        } else {
            recentlyPlayed.forEach((song, index) => {
                const card = createMusicCard(song, index, 'recent');
                grid.appendChild(card);
            });
        }
    }
}

function loadSavedSongs() {
    const grid = document.getElementById('savedGrid');
    if (grid) {
        grid.innerHTML = '';
        if (savedSongs.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💾</div>
                    <h3>No saved songs yet</h3>
                    <p>Save some songs to see them here!</p>
                    <button class="btn btn-primary" onclick="showPage('home')" style="margin-top: 1rem;">
                        Find Music
                    </button>
                </div>
            `;
        } else {
            savedSongs.forEach((song, index) => {
                const card = createMusicCard(song, index, 'saved');
                grid.appendChild(card);
            });
        }
    }
}

function loadUserPlaylists() {
    const grid = document.getElementById('playlistsGrid');
    if (grid) {
        grid.innerHTML = '';
        if (userPlaylists.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <h3>No playlists yet</h3>
                    <p>Create your first playlist to organize your music!</p>
                    <button class="btn btn-primary" onclick="showCreatePlaylist()" style="margin-top: 1rem;">
                        Create Playlist
                    </button>
                </div>
            `;
        } else {
            userPlaylists.forEach(playlist => {
                const card = createPlaylistCard(playlist);
                grid.appendChild(card);
            });
        }
    }
}

function createMusicCard(song, index, context = 'main') {
    const card = document.createElement('div');
    card.className = 'music-card';
    card.setAttribute('data-id', song.id);
    card.setAttribute('data-context', context);
    
    if (currentSong && currentSong.id === song.id) {
        card.classList.add('playing');
    }
    
    const thumbnail = song.thumbnail ? 
        `<img src="${song.thumbnail}" alt="${song.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
         <span style="display:none;">🎵</span>` : 
        `<span>🎵</span>`;
    
    card.innerHTML = `
        <div class="album-art">
            ${thumbnail}
            <div class="play-overlay">
                <button class="play-btn" onclick="playFromCard('${song.id}', '${context}')">▶</button>
            </div>
        </div>
        <div class="music-info">
            <h3 title="${escapeHtml(song.title)}">${truncateText(song.title, 30)}</h3>
            <p title="${escapeHtml(song.artist)}">${truncateText(song.artist, 25)}</p>
        </div>
        <div class="music-actions">
            <button class="action-btn ${song.liked ? 'active' : ''}" onclick="toggleLike('${song.id}')" title="Like">❤️</button>
            <span class="duration">${song.duration}</span>
            <button class="action-btn ${song.saved ? 'active' : ''}" onclick="toggleSave('${song.id}')" title="Save">💾</button>
            <button class="action-btn" onclick="showAddToPlaylist('${song.id}')" title="Add to Playlist">➕</button>
        </div>
    `;
    
    return card;
}

function createPlaylistCard(playlist) {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.onclick = () => showPlaylist(playlist.id);
    
    card.innerHTML = `
        <div class="playlist-cover">
            📋
        </div>
        <h3>${truncateText(playlist.name, 20)}</h3>
        <p>${truncateText(playlist.description || 'No description', 30)}</p>
        <span class="playlist-count">${playlist.songs.length} songs</span>
    `;
    
    return card;
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Player functions with enhanced demo mode
function playFromCard(songId, context = 'main') {
    const song = findSongById(songId, context);
    if (song) {
        currentSong = song;
        
        // Add to recently played
        addToRecentlyPlayed(song);
        
        // Update queue based on context
        updateQueue(context);
        
        updateCurrentTrackInfo();
        updatePlayingCards();
        
        // Since YouTube audio streaming requires server-side processing,
        // we'll run in demo mode with full UI functionality
        simulatePlayback();
        
        showSuccess(`▶️ Now playing: ${song.title}`);
    }
}

function simulatePlayback() {
    isPlaying = true;
    updatePlayPauseButtons();
    startProgressSimulation();
}

function startProgressSimulation() {
    if (progressInterval) clearInterval(progressInterval);
    
    currentProgress = 0;
    // Parse duration or use default
    const durationParts = currentSong.duration.split(':');
    if (durationParts.length === 2) {
        songDuration = parseInt(durationParts[0]) * 60 + parseInt(durationParts[1]);
    } else if (durationParts.length === 3) {
        songDuration = parseInt(durationParts[0]) * 3600 + parseInt(durationParts[1]) * 60 + parseInt(durationParts[2]);
    } else {
        songDuration = 210; // Default 3:30
    }
    
    progressInterval = setInterval(() => {
        if (!isPlaying) return;
        
        currentProgress += 1;
        updateProgressDisplay();
        
        if (currentProgress >= songDuration) {
            handleSongEnd();
        }
    }, 1000);
}

function updateProgressDisplay() {
    // Update compact player progress
    const compactProgress = document.getElementById('compactProgress');
    if (compactProgress) {
        const percentage = (currentProgress / songDuration) * 100;
        compactProgress.style.setProperty('--progress', `${percentage}%`);
    }
    
    // Update expanded player progress
    const expandedProgress = document.getElementById('expandedProgressFill');
    const expandedCurrentTime = document.getElementById('expandedCurrentTime');
    const expandedDuration = document.getElementById('expandedDuration');
    
    if (expandedProgress) {
        const percentage = (currentProgress / songDuration) * 100;
        expandedProgress.style.width = `${percentage}%`;
    }
    
    if (expandedCurrentTime) {
        expandedCurrentTime.textContent = formatTime(currentProgress);
    }
    
    if (expandedDuration) {
        expandedDuration.textContent = formatTime(songDuration);
    }
}

function updateDuration() {
    if (audioPlayer.duration) {
        songDuration = Math.floor(audioPlayer.duration);
        updateProgressDisplay();
    }
}

function updateProgress() {
    if (audioPlayer.duration) {
        currentProgress = Math.floor(audioPlayer.currentTime);
        updateProgressDisplay();
    }
}

function findSongById(id, context = 'main') {
    // Search in different contexts
    let songs = [];
    
    switch(context) {
        case 'liked':
            songs = likedSongs;
            break;
        case 'recent':
            songs = recentlyPlayed;
            break;
        case 'saved':
            songs = savedSongs;
            break;
        case 'playlist':
            const playlist = userPlaylists.find(p => p.id === currentPlaylistId);
            songs = playlist ? playlist.songs : [];
            break;
        default:
            // Search in current page's displayed songs
            const activeGrid = document.querySelector('.page.active .music-grid');
            if (activeGrid) {
                const cards = activeGrid.querySelectorAll('.music-card');
                for (const card of cards) {
                    if (card.getAttribute('data-id') === id) {
                        // Extract song data from card
                        const titleEl = card.querySelector('.music-info h3');
                        const artistEl = card.querySelector('.music-info p');
                        const imgEl = card.querySelector('.album-art img');
                        const durationEl = card.querySelector('.duration');
                        
                        return {
                            id: id,
                            title: titleEl ? titleEl.getAttribute('title') || titleEl.textContent : 'Unknown Title',
                            artist: artistEl ? artistEl.getAttribute('title') || artistEl.textContent : 'Unknown Artist',
                            thumbnail: imgEl && imgEl.style.display !== 'none' ? imgEl.src : null,
                            duration: durationEl ? durationEl.textContent : '0:00',
                            liked: isLiked(id),
                            saved: isSaved(id),
                            youtubeUrl: `https://www.youtube.com/watch?v=${id}`
                        };
                    }
                }
            }
            break;
    }
    
    return songs.find(song => song.id === id);
}

function togglePlayPause() {
    if (isPlaying) {
        pauseSong();
    } else {
        if (currentSong) {
            if (audioPlayer.src) {
                playSong();
            } else {
                simulatePlayback();
            }
        } else if (currentQueue.length > 0) {
            playFromCard(currentQueue[0].id);
        } else {
            showError('No song selected. Please choose a song to play.');
        }
    }
}

function playSong() {
    if (audioPlayer.src) {
        audioPlayer.play().catch(error => {
            console.error('Error playing audio:', error);
            simulatePlayback();
        });
    } else {
        simulatePlayback();
    }
}

function pauseSong() {
    isPlaying = false;
    updatePlayPauseButtons();
    if (progressInterval) clearInterval(progressInterval);
    if (audioPlayer.src) {
        audioPlayer.pause();
    }
}

function previousTrack() {
    if (currentQueue.length === 0) {
        showError('No songs in queue');
        return;
    }
    
    const currentIndex = currentQueue.findIndex(song => song.id === currentSong?.id);
    let previousIndex;
    
    if (isShuffle) {
        previousIndex = Math.floor(Math.random() * currentQueue.length);
    } else {
        previousIndex = currentIndex > 0 ? currentIndex - 1 : currentQueue.length - 1;
    }
    
    const previousSong = currentQueue[previousIndex];
    if (previousSong) {
        playFromCard(previousSong.id);
    }
}

function nextTrack() {
    if (currentQueue.length === 0) {
        showError('No songs in queue');
        return;
    }
    
    const currentIndex = currentQueue.findIndex(song => song.id === currentSong?.id);
    let nextIndex;
    
    if (isShuffle) {
        nextIndex = Math.floor(Math.random() * currentQueue.length);
    } else {
        nextIndex = (currentIndex + 1) % currentQueue.length;
    }
    
    const nextSong = currentQueue[nextIndex];
    if (nextSong) {
        playFromCard(nextSong.id);
    }
}

function handleSongEnd() {
    if (isRepeat) {
        currentProgress = 0;
        if (audioPlayer.src) {
            audioPlayer.currentTime = 0;
            playSong();
        } else {
            simulatePlayback();
        }
    } else {
        nextTrack();
    }
}

// Enhanced player UI functions
function expandPlayer() {
    const expandedPlayer = document.getElementById('expandedPlayer');
    expandedPlayer.classList.add('show');
    updateExpandedPlayerInfo();
}

function collapsePlayer() {
    const expandedPlayer = document.getElementById('expandedPlayer');
    expandedPlayer.classList.remove('show');
}

function updateExpandedPlayerInfo() {
    if (currentSong) {
        document.getElementById('expandedTitle').textContent = currentSong.title;
        document.getElementById('expandedArtist').textContent = currentSong.artist;
        
        const thumbnail = document.getElementById('expandedThumbnail');
        const defaultArt = document.getElementById('expandedDefaultArt');
        
        if (currentSong.thumbnail) {
            thumbnail.src = currentSong.thumbnail;
            thumbnail.style.display = 'block';
            defaultArt.style.display = 'none';
            thumbnail.onerror = function() {
                this.style.display = 'none';
                defaultArt.style.display = 'flex';
            };
        } else {
            thumbnail.style.display = 'none';
            defaultArt.style.display = 'flex';
        }
    }
}

// Queue functions
function updateQueue(context) {
    currentQueue = [];
    
    const activeGrid = document.querySelector('.page.active .music-grid');
    if (activeGrid) {
        const cards = activeGrid.querySelectorAll('.music-card');
        cards.forEach(card => {
            const id = card.getAttribute('data-id');
            const song = findSongById(id, context);
            if (song) {
                currentQueue.push(song);
            }
        });
    }
    
    updateQueueDisplay();
}

function updateQueueDisplay() {
    const currentQueueSong = document.getElementById('currentQueueSong');
    const queueList = document.getElementById('queueList');
    
    if (currentSong) {
        currentQueueSong.innerHTML = `
            <div class="queue-item">
                <img src="${currentSong.thumbnail || ''}" alt="" style="width: 40px; height: 40px; border-radius: 6px; margin-right: 0.75rem;" onerror="this.style.display='none';">
                <div class="queue-item-info">
                    <h5>${currentSong.title}</h5>
                    <p>${currentSong.artist}</p>
                </div>
            </div>
        `;
    }
    
    queueList.innerHTML = '';
    const currentIndex = currentQueue.findIndex(song => song.id === currentSong?.id);
    const upNext = currentQueue.slice(currentIndex + 1, currentIndex + 11); // Show next 10
    
    if (upNext.length === 0) {
        queueList.innerHTML = '<p style="opacity: 0.7; text-align: center;">No upcoming songs</p>';
    } else {
        upNext.forEach(song => {
            const queueItem = document.createElement('div');
            queueItem.className = 'queue-item';
            queueItem.onclick = () => playFromCard(song.id);
            queueItem.innerHTML = `
                <img src="${song.thumbnail || ''}" alt="" style="width: 40px; height: 40px; border-radius: 6px; margin-right: 0.75rem;" onerror="this.style.display='none';">
                <div class="queue-item-info">
                    <h5>${song.title}</h5>
                    <p>${song.artist}</p>
                </div>
            `;
            queueList.appendChild(queueItem);
        });
    }
}

function toggleQueue() {
    const queueSidebar = document.getElementById('queueSidebar');
    queueSidebar.classList.toggle('show');
}

// UI Update functions
function updateCurrentTrackInfo() {
    if (currentSong) {
        // Update compact player
        document.getElementById('compactTitle').textContent = currentSong.title;
        document.getElementById('compactArtist').textContent = currentSong.artist;
        
        const compactThumbnail = document.getElementById('compactThumbnail');
        const compactDefaultArt = document.getElementById('compactDefaultArt');
        
        if (currentSong.thumbnail) {
            compactThumbnail.src = currentSong.thumbnail;
            compactThumbnail.style.display = 'block';
            compactDefaultArt.style.display = 'none';
            compactThumbnail.onerror = function() {
                this.style.display = 'none';
                compactDefaultArt.style.display = 'flex';
            };
        } else {
            compactThumbnail.style.display = 'none';
            compactDefaultArt.style.display = 'flex';
        }
        
        // Update expanded player if visible
        if (document.getElementById('expandedPlayer').classList.contains('show')) {
            updateExpandedPlayerInfo();
        }
    }
}

function updatePlayPauseButtons() {
    const compactBtn = document.getElementById('compactPlayPauseBtn');
    const expandedBtn = document.getElementById('expandedPlayPauseBtn');
    
    const icon = isPlaying ? '⏸️' : '▶️';
    
    if (compactBtn) compactBtn.textContent = icon;
    if (expandedBtn) expandedBtn.textContent = icon;
}

function updatePlayingCards() {
    document.querySelectorAll('.music-card').forEach(card => {
        card.classList.remove('playing');
    });
    
    if (currentSong) {
        const playingCards = document.querySelectorAll(`[data-id="${currentSong.id}"]`);
        playingCards.forEach(card => card.classList.add('playing'));
    }
}

// Control functions
function toggleShuffle() {
    isShuffle = !isShuffle;
    const btn = document.getElementById('expandedShuffleBtn');
    if (btn) {
        btn.style.color = isShuffle ? '#89E7FA' : 'rgba(255, 255, 255, 0.7)';
        btn.classList.toggle('active', isShuffle);
    }
    saveToStorage();
    showSuccess(`🔀 Shuffle ${isShuffle ? 'enabled' : 'disabled'}`);
}

function toggleRepeat() {
    isRepeat = !isRepeat;
    const btn = document.getElementById('expandedRepeatBtn');
    if (btn) {
        btn.style.color = isRepeat ? '#89E7FA' : 'rgba(255, 255, 255, 0.7)';
        btn.classList.toggle('active', isRepeat);
    }
    saveToStorage();
    showSuccess(`🔁 Repeat ${isRepeat ? 'enabled' : 'disabled'}`);
}

function toggleMute() {
    const volumeSlider = document.getElementById('expandedVolumeSlider');
    const volumeBtn = document.getElementById('expandedVolumeBtn');
    
    if (isMuted) {
        audioPlayer.volume = previousVolume / 100;
        volumeSlider.value = previousVolume;
        isMuted = false;
        volumeBtn.textContent = previousVolume == 0 ? '🔇' : previousVolume < 30 ? '🔈' : previousVolume < 70 ? '🔉' : '🔊';
    } else {
        previousVolume = volumeSlider.value;
        audioPlayer.volume = 0;
        volumeSlider.value = 0;
        isMuted = true;
        volumeBtn.textContent = '🔇';
    }
}

function changeVolume(value) {
    audioPlayer.volume = value / 100;
    isMuted = value == 0;
    const volumeBtn = document.getElementById('expandedVolumeBtn');
    if (volumeBtn) {
        volumeBtn.textContent = value == 0 ? '🔇' : value < 30 ? '🔈' : value < 70 ? '🔉' : '🔊';
    }
    
    if (!isMuted) {
        previousVolume = value;
    }
}

function seekTo(event) {
    const progressBar = event.currentTarget;
    const clickX = event.offsetX;
    const width = progressBar.offsetWidth;
    const percentage = clickX / width;
    
    if (audioPlayer.duration) {
        audioPlayer.currentTime = audioPlayer.duration * percentage;
    } else {
        currentProgress = Math.floor(songDuration * percentage);
        updateProgressDisplay();
    }
}

// Action functions
function toggleLike(songId) {
    const isCurrentlyLiked = isLiked(songId);
    
    if (isCurrentlyLiked) {
        likedSongs = likedSongs.filter(song => song.id !== songId);
        showSuccess('💔 Removed from liked songs');
    } else {
        const song = findSongInAllContexts(songId);
        if (song) {
            song.liked = true;
            likedSongs.push(song);
            showSuccess('❤️ Added to liked songs');
        }
    }
    
    // Update UI
    updateActionButtons(songId);
    saveToStorage();
}

function toggleSave(songId) {
    const isCurrentlySaved = isSaved(songId);
    
    if (isCurrentlySaved) {
        savedSongs = savedSongs.filter(song => song.id !== songId);
        showSuccess('❌ Removed from saved songs');
    } else {
        const song = findSongInAllContexts(songId);
        if (song) {
            song.saved = true;
            savedSongs.push(song);
            showSuccess('💾 Added to saved songs');
        }
    }
    
    // Update UI
    updateActionButtons(songId);
    saveToStorage();
}

function findSongInAllContexts(songId) {
    // Search in all possible contexts
    let song = null;
    
    // Search in liked songs
    song = likedSongs.find(s => s.id === songId);
    if (song) return song;
    
    // Search in saved songs
    song = savedSongs.find(s => s.id === songId);
    if (song) return song;
    
    // Search in recent
    song = recentlyPlayed.find(s => s.id === songId);
    if (song) return song;
    
    // Search in current display
    const activeGrid = document.querySelector('.page.active .music-grid');
    if (activeGrid) {
        const card = activeGrid.querySelector(`[data-id="${songId}"]`);
        if (card) {
            const titleEl = card.querySelector('.music-info h3');
            const artistEl = card.querySelector('.music-info p');
            const imgEl = card.querySelector('.album-art img');
            const durationEl = card.querySelector('.duration');
            
            return {
                id: songId,
                title: titleEl ? titleEl.getAttribute('title') || titleEl.textContent : 'Unknown Title',
                artist: artistEl ? artistEl.getAttribute('title') || artistEl.textContent : 'Unknown Artist',
                thumbnail: imgEl && imgEl.style.display !== 'none' ? imgEl.src : null,
                duration: durationEl ? durationEl.textContent : '0:00',
                liked: true,
                saved: true,
                youtubeUrl: `https://www.youtube.com/watch?v=${songId}`
            };
        }
    }
    return null;
}

function updateActionButtons(songId) {
    const cards = document.querySelectorAll(`[data-id="${songId}"]`);
    cards.forEach(card => {
        const likeBtn = card.querySelector('.action-btn:first-child');
        const saveBtn = card.querySelector('.action-btn:nth-child(3)');
        
        if (likeBtn) {
            likeBtn.classList.toggle('active', isLiked(songId));
        }
        if (saveBtn) {
            saveBtn.classList.toggle('active', isSaved(songId));
        }
    });
}

function isLiked(songId) {
    return likedSongs.some(song => song.id === songId);
}

function isSaved(songId) {
    return savedSongs.some(song => song.id === songId);
}

function addToRecentlyPlayed(song) {
    // Remove if already exists
    recentlyPlayed = recentlyPlayed.filter(s => s.id !== song.id);
    
    // Add to beginning
    recentlyPlayed.unshift(song);
    
    // Keep only last 50
    if (recentlyPlayed.length > 50) {
        recentlyPlayed = recentlyPlayed.slice(0, 50);
    }
    
    saveToStorage();
}

// Playlist functions
function showCreatePlaylist() {
    document.getElementById('createPlaylistModal').classList.add('show');
}

function closeCreatePlaylistModal() {
    document.getElementById('createPlaylistModal').classList.remove('show');
    document.getElementById('createPlaylistForm').reset();
}

function handleCreatePlaylist(event) {
    event.preventDefault();
    
    const name = document.getElementById('playlistName').value.trim();
    const description = document.getElementById('playlistDesc').value.trim();
    
    if (!name) {
        showError('Please enter a playlist name');
        return;
    }
    
    const newPlaylist = {
        id: Date.now().toString(),
        name: name,
        description: description,
        songs: [],
        createdAt: new Date().toISOString()
    };
    
    userPlaylists.push(newPlaylist);
    updateUserPlaylistsList();
    saveToStorage();
    closeCreatePlaylistModal();
    
    showSuccess('📋 Playlist created successfully!');
}

function showAddToPlaylist(songId) {
    addToPlaylistSongId = songId;
    
    const playlistSelection = document.getElementById('playlistSelection');
    playlistSelection.innerHTML = '';
    
    if (userPlaylists.length === 0) {
        playlistSelection.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <p>No playlists available.</p>
                <button class="btn btn-primary" onclick="closeAddToPlaylistModal(); showCreatePlaylist();">Create Your First Playlist</button>
            </div>
        `;
    } else {
        userPlaylists.forEach(playlist => {
            const option = document.createElement('div');
            option.className = 'playlist-option';
            option.onclick = () => addSongToPlaylist(playlist.id);
            option.innerHTML = `
                <div class="playlist-option-icon">📋</div>
                <div>
                    <h4>${playlist.name}</h4>
                    <p>${playlist.songs.length} songs</p>
                </div>
            `;
            playlistSelection.appendChild(option);
        });
    }
    
    document.getElementById('addToPlaylistModal').classList.add('show');
}

function closeAddToPlaylistModal() {
    document.getElementById('addToPlaylistModal').classList.remove('show');
    addToPlaylistSongId = null;
}

function addSongToPlaylist(playlistId) {
    if (!addToPlaylistSongId) return;
    
    const playlist = userPlaylists.find(p => p.id === playlistId);
    const song = findSongInAllContexts(addToPlaylistSongId);
    
    if (playlist && song) {
        // Check if song already exists in playlist
        if (!playlist.songs.some(s => s.id === song.id)) {
            playlist.songs.push(song);
            saveToStorage();
            showSuccess(`➕ Added to "${playlist.name}"!`);
        } else {
            showError('⚠️ Song already exists in this playlist!');
        }
    }
    
    closeAddToPlaylistModal();
}

function playPlaylist() {
    const playlist = userPlaylists.find(p => p.id === currentPlaylistId);
    if (playlist && playlist.songs.length > 0) {
        currentQueue = [...playlist.songs];
        playFromCard(playlist.songs[0].id, 'playlist');
        showSuccess('▶️ Playing playlist');
    }
}

function shufflePlaylist() {
    const playlist = userPlaylists.find(p => p.id === currentPlaylistId);
    if (playlist && playlist.songs.length > 0) {
        currentQueue = [...playlist.songs];
        const randomIndex = Math.floor(Math.random() * playlist.songs.length);
        isShuffle = true;
        const shuffleBtn = document.getElementById('expandedShuffleBtn');
        if (shuffleBtn) {
            shuffleBtn.style.color = '#89E7FA';
            shuffleBtn.classList.add('active');
        }
        playFromCard(playlist.songs[randomIndex].id, 'playlist');
        showSuccess('🔀 Shuffling playlist');
    }
}

function updateUserPlaylistsList() {
    const playlistsList = document.getElementById('userPlaylistsList');
    playlistsList.innerHTML = '';
    
    userPlaylists.forEach(playlist => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.onclick = () => showPlaylist(playlist.id);
        item.innerHTML = `
            <div class="playlist-icon">📋</div>
            <span>${truncateText(playlist.name, 15)}</span>
        `;
        playlistsList.appendChild(item);
    });
}

// Enhanced Bug Report Functions
function handleBugReport(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const bugReport = {
        title: formData.get('bugTitle'),
        type: formData.get('bugType'),
        severity: formData.get('bugSeverity'),
        description: formData.get('bugDescription'),
        steps: formData.get('stepsToReproduce'),
        deviceInfo: formData.get('deviceInfo'),
        browserInfo: formData.get('browserInfo'),
        email: formData.get('userEmail'),
        allowFollowup: formData.get('allowFollowup') === 'on',
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
    };
    
    // Simulate bug report submission
    showLoading(true);
    
    setTimeout(() => {
        showLoading(false);
        showSuccess('🐛 Bug report submitted successfully! Thank you for helping us improve Pattupetti.');
        resetBugForm();
        
        // Save bug report to local storage for testing
        const savedReports = JSON.parse(localStorage.getItem('pattupetti_bug_reports') || '[]');
        savedReports.push(bugReport);
        localStorage.setItem('pattupetti_bug_reports', JSON.stringify(savedReports));
        
        // Update bug stats
        updateBugStats(savedReports.length);
    }, 2000);
}

function resetBugForm() {
    document.getElementById('bugReportForm').reset();
    showSuccess('📝 Form reset successfully');
}

function autoDetectBrowser() {
    const deviceInfo = document.getElementById('deviceInfo');
    const browserInfo = document.getElementById('browserInfo');
    
    // Auto-detect browser
    const userAgent = navigator.userAgent;
    let browser = 'Unknown';
    let version = 'Unknown';
    
    if (userAgent.includes('Chrome')) {
        browser = 'Chrome';
        version = userAgent.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.includes('Firefox')) {
        browser = 'Firefox';
        version = userAgent.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        browser = 'Safari';
        version = userAgent.match(/Version\/(\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.includes('Edge')) {
        browser = 'Edge';
        version = userAgent.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
    }
    
    browserInfo.value = `${browser} ${version}`;
    
    // Auto-detect device
    let device = 'Desktop';
    if (/Android/i.test(userAgent)) {
        device = 'Android';
    } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
        device = 'iOS';
    } else if (/Windows/i.test(userAgent)) {
        device = 'Windows';
    } else if (/Mac/i.test(userAgent)) {
        device = 'Mac';
    } else if (/Linux/i.test(userAgent)) {
        device = 'Linux';
    }
    
    deviceInfo.value = device;
    
    showSuccess('🔍 Browser and device info detected automatically!');
}

function autoDetectBrowserInfo() {
    // This runs on page load
    const userAgent = navigator.userAgent;
    console.log('User Agent:', userAgent);
}

function updateBugStats(totalReports) {
    const bugsFixed = document.getElementById('bugsFixed');
    if (bugsFixed) {
        bugsFixed.textContent = `${Math.min(totalReports + 25, 100)}+`;
    }
}

// Support page functions
function shareApp() {
    if (navigator.share) {
        navigator.share({
            title: 'Pattupetti - Music Streaming',
            text: 'Check out this amazing music streaming app with a beautiful interface!',
            url: window.location.href
        }).then(() => {
            showSuccess('📱 App shared successfully!');
        }).catch(err => {
            console.log('Error sharing:', err);
            fallbackShare();
        });
    } else {
        fallbackShare();
    }
}

function fallbackShare() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        showSuccess('📋 App link copied to clipboard!');
    }).catch(() => {
        showError('Unable to share. Please copy the URL manually: ' + url);
    });
}

// Utility functions
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
    }
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

function showNotification(message, type) {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.cssText = `
        position: fixed;
        top: 90px;
        right: 20px;
        background: ${type === 'success' ? 'linear-gradient(45deg, #4CAF50, #45a049)' : 'linear-gradient(45deg, #f44336, #da190b)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 350px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        font-size: 0.9rem;
        line-height: 1.4;
        font-weight: 500;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2);
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function showWelcomeMessage() {
    setTimeout(() => {
        showSuccess('🎵 Welcome to Pattupetti! Discover amazing music with our beautiful interface.');
    }, 1000);
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('show');
    });
}

function updateUIElements() {
    // Update volume slider if exists
    const volumeSlider = document.getElementById('expandedVolumeSlider');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', function() {
            changeVolume(this.value);
        });
    }
}

// Storage functions
function saveToStorage() {
    try {
        const data = {
            likedSongs,
            savedSongs,
            recentlyPlayed,
            userPlaylists,
            isShuffle,
            isRepeat,
            currentSong,
            version: '2.0.1'
        };
        localStorage.setItem('pattupetti_data', JSON.stringify(data));
    } catch (error) {
        console.error('Error saving data:', error);
        showError('Unable to save data. Storage may be full.');
    }
}

function loadStoredData() {
    try {
        const data = localStorage.getItem('pattupetti_data');
        if (data) {
            const parsed = JSON.parse(data);
            likedSongs = parsed.likedSongs || [];
            savedSongs = parsed.savedSongs || [];
            recentlyPlayed = parsed.recentlyPlayed || [];
            userPlaylists = parsed.userPlaylists || [];
            isShuffle = parsed.isShuffle || false;
            isRepeat = parsed.isRepeat || false;
            
            // Update UI
            const shuffleBtn = document.getElementById('expandedShuffleBtn');
            const repeatBtn = document.getElementById('expandedRepeatBtn');
            
            if (shuffleBtn) {
                shuffleBtn.style.color = isShuffle ? '#89E7FA' : 'rgba(255, 255, 255, 0.7)';
                shuffleBtn.classList.toggle('active', isShuffle);
            }
            if (repeatBtn) {
                repeatBtn.style.color = isRepeat ? '#89E7FA' : 'rgba(255, 255, 255, 0.7)';
                repeatBtn.classList.toggle('active', isRepeat);
            }
            
            updateUserPlaylistsList();
            console.log('Data loaded successfully');
        }
    } catch (error) {
        console.error('Error loading stored data:', error);
        showError('Unable to load saved data. Starting fresh.');
    }
}

// Window resize handler for responsive design
window.addEventListener('resize', function() {
    manageMobilePlayerVisibility();
    
    // Close sidebar on desktop resize
    if (window.innerWidth > 768 && sidebarVisible) {
        closeSidebar();
    }
});

// Add CSS animations dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Service Worker Registration (for future PWA features)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // Service worker will be implemented in future updates
        console.log('Service Worker support detected - PWA features coming soon!');
    });
}

console.log('🎵 Pattupetti Music Streaming v2.0.1 - Loaded successfully!');

