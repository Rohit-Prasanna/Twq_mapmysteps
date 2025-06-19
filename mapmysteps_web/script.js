import { app, db, auth } from './firebase-config.js';


import {
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";

import {


    onSnapshot,
    initializeFirestore,
    collection,
    persistentLocalCache,
    getDocs,
    getDoc,
    query,
    orderBy,
    doc
} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";




//------firebase-------


const provider = new GoogleAuthProvider();
const journalEntriesByDate = {};
let user = auth.currentUser;


let currentLocation = null;
let map;
let currentPositionMarker;
const daysWithData = Object.keys(journalEntriesByDate);

// --- DOM Elements ---
let mapContainerElement;
let entriesListElement;
let currentLocationDisplayElement;
let errorDisplayElement;
let loadingDisplayElement;
let addEntryButtonElement;
let requestPermissionButtonElement;

// --- Constants ---
const DEFAULT_CENTER = [13, -122]; // Los Angeles
const DEFAULT_ZOOM = 13;
const INITIAL_ZOOM_CURRENT_LOCATION = 15;



// 🔁 Listen for auth state changes (auto-login if already signed in)
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User is signed in:", user.email);
        document.getElementById('loginPage').style.display = 'none';
        document.querySelector('main').style.display = '';
        document.querySelector('header').style.display = '';




    } else {
        console.log("No user is signed in.");
        document.getElementById('loginPage').style.display = '';
        document.querySelector('main').style.display = 'none';
        document.querySelector('header').style.display = 'none';
    }
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    mapContainerElement = document.getElementById('map');
    entriesListElement = document.getElementById('entriesList');
    currentLocationDisplayElement = document.getElementById('currentLocationDisplay');
    errorDisplayElement = document.getElementById('errorDisplay');
    loadingDisplayElement = document.getElementById('loadingDisplay');
    addEntryButtonElement = document.getElementById('addEntryButton');
    requestPermissionButtonElement = document.getElementById('requestPermissionButton');


    initMap();

    requestLocationPermission();

    if (addEntryButtonElement) {
        addEntryButtonElement.addEventListener('click', handleAddEntry);
    }

    if (requestPermissionButtonElement) {
        requestPermissionButtonElement.addEventListener('click', requestLocationPermission);
    }


    renderJournalEntries();
    updateMapMarkers();
});

function ensurePermissionsAndStart() {
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') {
           // Start tracking
        } else if (result.state === 'prompt') {
            navigator.geolocation.getCurrentPosition(
                () => start(),
                (error) => console.error("Permission denied or error:", error)
            );
        } else {
            alert("Location permission denied. Please enable it in browser/app settings.");
        }
    });
}


// --- Location Functions ---
function requestLocationPermission() {
    if (navigator.geolocation) {
        showLoadingMessage("Fetching your location...");
        hideErrorMessage();
        if (requestPermissionButtonElement) requestPermissionButtonElement.style.display = 'none';

        navigator.geolocation.watchPosition(handleLocationSuccess, handleLocationError, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        });
    } else {
        showErrorMessage("Geolocation not supported.");
        hideLoadingMessage();
    }
}

// --- Map Functions ---
function initMap() {
    map = L.map(mapContainerElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
    }).addTo(map);
}

// ---- MapCenter -----
async function updateMapCenter(zoomLevel = DEFAULT_ZOOM) {
    let user = auth.currentUser;
    if (currentLocation) {
        map.setView([currentLocation.latitude, currentLocation.longitude], zoomLevel);
    } else {

        if (!user) {
            console.warn("User not authenticated. Cannot fetch location data.");
            return;
        }


        const userId = user.uid;
        const locationsRef = doc(db, "locations", userId);


        try {
            // Get all date subcollections (limited to recent days if needed)
            const snapshot = await locationsRef.listCollections();

            // Sort subcollections by date descending (e.g., ["2025-06-07", "2025-06-06", ...])
            const sortedDates = snapshot
                .map(col => col.id)
                .sort((a, b) => b.localeCompare(a)); // Reverse date order

            for (const date of sortedDates) {
                const dayRef = locationsRef.collection(date);
                const daySnapshot = await dayRef
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();

                if (!daySnapshot.empty) {
                    const doc = daySnapshot.docs[0];
                    const { latitude, longitude } = doc.data();
                    map.setView([latitude, longitude], zoomLevel);
                    return;
                }
            }

            // If no data found at all
            console.warn("No location data found for any day.");
            map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        } catch (error) {
            console.error("Error fetching location data:", error);
            map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        }
    }
}

// ---- MapMarkers ----

function updateMapMarkers() {
    let user = auth.currentUser;
    // Remove all non-current-location markers
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && layer !== currentPositionMarker) {
            map.removeLayer(layer);
        }
    });

    // Add/update the current location marker
    if (currentLocation) {
        const currentLatLng = [currentLocation.latitude, currentLocation.longitude];
        if (currentPositionMarker) {
            currentPositionMarker.setLatLng(currentLatLng);
        } else {
            currentPositionMarker = L.marker(currentLatLng, {
                icon: L.divIcon({
                    html: '📍',
                    className: 'current-location-icon',
                    iconSize: [24, 24],
                    iconAnchor: [12, 24],
                    popupAnchor: [0, -24]
                })
            }).addTo(map);
            currentPositionMarker.bindPopup("<b>Your current location</b>");
        }
    }


    if (!user) {
        console.warn("User not authenticated.");
        return;
    }

    const userId = user.uid;
    const selected = selectedDate || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dayRef = firebase.firestore()
        .collection("locations")
        .doc(userId)
        .collection(selected);

    // Listen for real-time updates
    dayRef.orderBy("timestamp", "desc").onSnapshot(snapshot => {
        snapshot.forEach(doc => {
            const entry = doc.data();
            const entryLatLng = [entry.coordinates.latitude, entry.coordinates.longitude];
            const marker = L.marker(entryLatLng).addTo(map);
            const popupContent = `<b>${entry.address || 'Location Entry'}</b><br>${new Date(entry.timestamp).toLocaleString()}`;
            marker.bindPopup(popupContent);
        });
    }, error => {
        console.error("Error loading markers:", error);
    });
}
// ---- HANDLES -----

function handleAddEntry() {
    let user = auth.currentUser;
    if (!currentLocation) {
        showErrorMessage("Current location not available.");
        return;
    }


    if (!user) {
        showErrorMessage("User not logged in.");
        return;
    }

    const entry = {
        timestamp: Date.now(),
        coordinates: { ...currentLocation },
        address: currentLocation.address || null
    };

    const dateKey = new Date(entry.timestamp).toISOString().split('T')[0];

    const docRef = firebase.firestore()
        .collection("locations")
        .doc(user.uid)
        .collection(dateKey)
        .doc(entry.timestamp.toString());

    docRef.set(entry).then(() => {
        console.log("Entry saved to Firestore.");
    }).catch(error => {
        console.error("Error writing entry to Firestore:", error);
        showErrorMessage("Failed to log location.");
    });
}


function handleLocationSuccess(position) {
    hideLoadingMessage();
    hideErrorMessage();

    const newLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
    };

    const locationChanged =
        !currentLocation ||
        Math.abs(currentLocation.latitude - newLocation.latitude) > 0.00001 ||
        Math.abs(currentLocation.longitude - newLocation.longitude) > 0.00001;

    if (locationChanged) {
        const isFirstFix = !currentLocation;
        currentLocation = newLocation;
        updateMapCenter(isFirstFix ? INITIAL_ZOOM_CURRENT_LOCATION : map.getZoom());
        updateMapMarkers();

        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLocation.latitude}&lon=${currentLocation.longitude}`)
            .then(res => res.json())
            .then(data => {
                const name = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.display_name;
                currentLocationDisplayElement.textContent = `📍 ${name}`;
                currentLocation.address = name;
                handleAddEntry();


            })
            .catch(err => {
                console.error("Reverse geocoding failed:", err);
                currentLocationDisplayElement.textContent = `Lat: ${currentLocation.latitude.toFixed(4)}, Lon: ${currentLocation.longitude.toFixed(4)}`;
                handleAddEntry();


            });
    }
}

function handleLocationError(error) {
    hideLoadingMessage();
    let message = "Location error: ";
    switch (error.code) {
        case error.PERMISSION_DENIED:
            message += "Permission denied.";
            if (requestPermissionButtonElement) requestPermissionButtonElement.style.display = 'inline-block';
            break;
        case error.POSITION_UNAVAILABLE:
            message += "Position unavailable.";
            break;
        case error.TIMEOUT:
            message += "Timeout getting location.";
            break;
        default:
            message += "Unknown error.";
    }
    showErrorMessage(message);
    addEntryButtonElement.disabled = true;
}




// --- UI Helpers ---
function showErrorMessage(msg) {
    if (errorDisplayElement) {
        errorDisplayElement.textContent = msg;
        errorDisplayElement.style.display = 'block';
    }
    console.error(msg);
}

function hideErrorMessage() {
    if (errorDisplayElement) errorDisplayElement.style.display = 'none';
}

function showLoadingMessage(msg) {
    if (loadingDisplayElement) {
        loadingDisplayElement.textContent = msg;
        loadingDisplayElement.style.display = 'block';
    }
}

function hideLoadingMessage() {
    if (loadingDisplayElement) loadingDisplayElement.style.display = 'none';
}
let selectedDate = null;
let currentDate = new Date();

const today = new Date();
selectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

// ---- CALENDAR ----
function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthYear = document.getElementById('monthYear');
    const container = document.getElementById('calendarDays');

    monthYear.textContent = date.toLocaleDateString('default', { month: 'long', year: 'numeric' });
    container.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let i = 0; i < firstDay; i++) {
        container.innerHTML += `<div></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const div = document.createElement('div');
        div.textContent = d;

        if (fullDate === selectedDate) div.classList.add('selected');
        if (fullDate === todayStr && fullDate !== selectedDate) div.classList.add('today');
        if (daysWithData.includes(fullDate) && fullDate !== selectedDate && fullDate !== todayStr) div.classList.add('logged');

        div.addEventListener('click', () => {
            selectedDate = fullDate;
            renderCalendar(date);
            fetchEntriesFromFirestoreForDate(selectedDate).then(() => {
                renderJournalEntries();
                updateMapMarkers();
            });
            console.log("Selected date:", fullDate);
        });

        container.appendChild(div);
    }
}

async function fetchEntriesFromFirestoreForDate(dateStr) {
    const user = auth.currentUser;
    if (!user) {
        showErrorMessage("User not logged in.");
        return;
    }

    try {
        const entriesRef = collection(db, "locations", user.uid, dateStr);
        const snapshot = await getDocs(entriesRef);
        journalEntriesByDate[dateStr] = [];

        snapshot.forEach(doc => {
            journalEntriesByDate[dateStr].push(doc.data());
        });

        console.log(`Fetched ${journalEntriesByDate[dateStr].length} entries for ${dateStr}`);
    } catch (error) {
        console.error("Error fetching entries:", error);
        showErrorMessage("Could not fetch entries from Firestore.");
    }
}

let unsubscribeJournal = null;

async function renderJournalEntries() {
    const list = document.getElementById('entriesList');
    list.innerHTML = '<p class="muted">Loading...</p>';

    const user = auth.currentUser;
    if (!user) {
        list.innerHTML = '<p class="muted">You must be signed in to see entries.</p>';
        return;
    }

    const date = selectedDate;
    const entriesRef = collection(db, "locations", user.uid, date);
    const q = query(entriesRef, orderBy("timestamp", "desc"));

    if (unsubscribeJournal) {
        unsubscribeJournal(); // Detach old listener
    }

    unsubscribeJournal = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            list.innerHTML = '<p class="muted">No entries for this day.</p>';
            return;
        }

        list.innerHTML = '';
        for (const doc of snapshot.docs) {
            const entry = doc.data();
            const locationName = await reverseGeocode(entry.latitude, entry.longitude);
            const card = document.createElement('div');
            card.className = 'entry-card';
            card.innerHTML = `
                <h4>${locationName}</h4>
                <p class="timestamp">${new Date(entry.timestamp).toLocaleString()}</p>
            `;
            list.appendChild(card);
        }
    }, (error) => {
        console.error("❌ Real-time listener error:", error);
        list.innerHTML = '<p class="error">Failed to load entries in real-time.</p>';
    });
}

async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
        const data = await response.json();
        const locationName = data.city || data.locality || data.principalSubdivision;
        return locationName

    } catch (error) {
        console.error("Reverse geocoding failed:", error);
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

// Button Events
document.getElementById('prevMonth').onclick = () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar(currentDate);
};
document.getElementById('nextMonth').onclick = () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar(currentDate);
};

// Initial load
renderCalendar(currentDate);

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {

          
        fetchEntriesFromFirestoreForDate(selectedDate).then(() => {
            renderJournalEntries();
            updateMapMarkers();

        });
        
    }, 2000); // 5000 ms = 5 seconds
});


// ▶️ Google Sign-In
document.getElementById('googleSignInBtn').addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .then(async (result) => {
            const user = result.user;
            console.log("Login successful:", user.email);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const googleIdToken = credential.idToken;

            window.location.href = `mysteps://start-tracking?token=${encodeURIComponent(googleIdToken)}`;


        })
        .catch((error) => {
            console.error("Login failed:", error.message);
            alert("Login failed: " + error.message);
        });
});


// 🚪 Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth)
        .then(() => {
            console.log("✅ Firebase sign-out successful");

            // Optional: Force Google session logout
            const logoutWindow = window.open('https://accounts.google.com/Logout', '_blank');
            setTimeout(() => {
                if (logoutWindow) logoutWindow.close();
            }, 1000);

        })
        .catch((error) => {
            console.error("❌ Logout failed:", error.message);
        });
});


